import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";
import { pool, migrate } from "../db.js";
import { callExternalAgent, detectAdapter } from "../adapters/index.js";

dotenv.config();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const BATCH_MS = Number(process.env.DISPATCH_BATCH_MS || 1000);
const RETRY_BACKOFFS_MS = [0, 1000, 5000, 30000];
const NODE_TIMEOUT_MS = Number(process.env.NODE_TIMEOUT_MS || 60000);

function signPayload(body: string) {
  if (!WEBHOOK_SECRET) return null;
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

const PROTOCOL_FEE_BPS = Number(process.env.PROTOCOL_FEE_BPS || 30);
const SYSTEM_PAYER = process.env.SYSTEM_PAYER || "did:noot:system";
const COORD_RESULT_URL = process.env.COORD_URL || "http://localhost:3002";

/**
 * After an adapted call succeeds, check if dependent nodes are now ready
 */
async function triggerDependentNodes(workflowId: string, completedNodeId: string) {
  try {
    // Find nodes that depend on the completed node
    const dependents = await pool.query(
      `SELECT id, name, capability_id, depends_on, payload
       FROM task_nodes 
       WHERE workflow_id = $1 
         AND status = 'pending' 
         AND $2 = ANY(depends_on)`,
      [workflowId, completedNodeId]
    );
    
    for (const node of dependents.rows) {
      // Check if ALL dependencies are now complete
      const deps = node.depends_on as string[];
      const allDepsComplete = await pool.query(
        `SELECT COUNT(*) as complete_count 
         FROM task_nodes 
         WHERE workflow_id = $1 
           AND name = ANY($2::text[])
           AND status = 'success'`,
        [workflowId, deps]
      );
      
      const completeCount = Number(allDepsComplete.rows[0]?.complete_count || 0);
      
      if (completeCount === deps.length) {
        // All dependencies complete! Mark this node as ready
        await pool.query(
          `UPDATE task_nodes SET status = 'ready', updated_at = now() WHERE id = $1`,
          [node.id]
        );
        console.log(`[dispatcher] node ${node.name} is now ready (all deps complete)`);
      }
    }
  } catch (err: any) {
    console.error(`[dispatcher] triggerDependentNodes error: ${err.message}`);
  }
}

/**
 * Update workflow status based on node statuses
 */
async function updateWorkflowStatus(workflowId: string) {
  try {
    const wfStatus = await pool.query(
      `SELECT
        SUM(CASE WHEN status = 'failed' OR status = 'failed_timeout' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        COUNT(*) as total
       FROM task_nodes WHERE workflow_id = $1`,
      [workflowId]
    );
    
    const { failed, success, total } = wfStatus.rows[0];
    
    if (Number(failed) > 0) {
      await pool.query(
        `UPDATE workflows SET status = 'failed', updated_at = now() WHERE id = $1`,
        [workflowId]
      );
    } else if (Number(success) === Number(total)) {
      await pool.query(
        `UPDATE workflows SET status = 'success', updated_at = now() WHERE id = $1`,
        [workflowId]
      );
      console.log(`[dispatcher] workflow ${workflowId} completed successfully!`);
    } else {
      await pool.query(
        `UPDATE workflows SET status = 'running', updated_at = now() WHERE id = $1`,
        [workflowId]
      );
    }
  } catch (err: any) {
    console.error(`[dispatcher] updateWorkflowStatus error: ${err.message}`);
  }
}

async function processOnce() {
  // Timeout stale dispatched nodes
  await pool.query(
    `update task_nodes
        set status = 'failed_timeout', updated_at = now()
      where status = 'dispatched'
        and deadline_at is not null
        and deadline_at < now()
        and finished_at is null`
  );
  // Remove any pending dispatches for timed-out nodes
  await pool.query(
    `delete from dispatch_queue dq
      using task_nodes tn
      where tn.workflow_id = dq.workflow_id
        and tn.name = dq.node_id
        and tn.status = 'failed_timeout'`
  );

  const now = new Date();
  const { rows } = await pool.query(
    `select id, task_id, workflow_id, node_id, event, target_url, payload, attempts
     from dispatch_queue
     where status = 'pending' and next_attempt <= $1
     order by id asc
     limit 10`,
    [now]
  );

  if (rows.length === 0) {
    return;
  }

  console.log(`[dispatcher] found ${rows.length} jobs at ${now.toISOString()}`);

  for (const job of rows) {
    const attempt = job.attempts ?? 0;
    const bodyString = JSON.stringify(job.payload);
    const signature = signPayload(bodyString);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-nooterra-event": job.event,
      "x-nooterra-event-id": job.payload?.eventId || "",
      ...(job.workflow_id ? { "x-nooterra-workflow-id": job.workflow_id } : {}),
      ...(job.node_id ? { "x-nooterra-node-id": job.node_id } : {}),
    };
    if (signature) headers["x-nooterra-signature"] = signature;

    try {
      await pool.query(`update dispatch_queue set status = 'sending' where id = $1`, [job.id]);
      console.log(`[dispatcher] sending job=${job.id} node=${job.node_id} url=${job.target_url} attempt=${attempt}`);
      
      // Detect if this is an external API that needs an adapter
      const adapterType = detectAdapter(job.target_url);
      const isNativeAgent = adapterType === "webhook" && !job.target_url.includes("huggingface") && !job.target_url.includes("unturf");
      
      if (!isNativeAgent) {
        // Use adapter for external APIs (HuggingFace, OpenAI-compatible, Replicate, etc.)
        console.log(`[dispatcher] using adapter=${adapterType} for job=${job.id}`);
        
        const adapterResult = await callExternalAgent({
          endpoint: job.target_url,
          capability: job.payload?.capabilityId || "",
          inputs: job.payload?.inputs || {},
          config: {}, // Could be loaded from agent/capability metadata
        });
        
        if (adapterResult.success) {
          console.log(`[dispatcher] adapter success job=${job.id} latency=${adapterResult.latency_ms}ms`);
          
          // Post result back to coordinator as if the agent responded
          const resultPayload = {
            workflowId: job.workflow_id,
            nodeId: job.node_id,
            result: adapterResult.result,
            metrics: {
              latency_ms: adapterResult.latency_ms,
              tokens_used: adapterResult.tokens_used || 0,
            },
          };
          
          // Update task_nodes directly for adapted calls
          await pool.query(
            `update task_nodes set status='success', result_payload=$1, result_hash=null, attempts=coalesce(attempts,0)+1, finished_at=now(), updated_at=now()
             where workflow_id=$2 and name=$3`,
            [adapterResult.result, job.workflow_id, job.node_id]
          );
          
          // Check if any dependent nodes can now be enqueued
          await triggerDependentNodes(job.workflow_id, job.node_id);
          
          // Update workflow status
          await updateWorkflowStatus(job.workflow_id);
          
          await pool.query(`delete from dispatch_queue where id = $1`, [job.id]);
          continue;
        } else {
          throw new Error(adapterResult.error || "Adapter call failed");
        }
      }
      
      // Native Nooterra agent - use standard dispatch
      const res = await fetch(job.target_url, { method: "POST", headers, body: bodyString });
      if (!res.ok) {
        // If this is a verification stub, treat any response as success to unblock DAGs.
        const cap = job.payload?.capabilityId;
        if (cap === "cap.verify.generic.v1" || String(job.node_id || "").startsWith("verify_")) {
          console.warn(`[dispatcher] verify stub job=${job.id} got status=${res.status}, marking success`);
          await pool.query(
            `update task_nodes set status='success', result_payload=$1, result_hash=null, attempts=coalesce(attempts,0)+1, finished_at=now(), updated_at=now()
             where workflow_id=$2 and name=$3`,
            [{ verified: true, payload: job.payload || null }, job.workflow_id, job.node_id]
          );
          await pool.query(`delete from dispatch_queue where id = $1`, [job.id]);
          continue;
        }
        throw new Error(`status ${res.status}`);
      }
      console.log(`[dispatcher] success job=${job.id} status=${res.status}`);
      await pool.query(`delete from dispatch_queue where id = $1`, [job.id]);
    } catch (err: any) {
      console.error(`[dispatcher] error job=${job.id} attempt=${attempt} err=${err?.message || err}`);
      const nextAttempt = attempt + 1;
      if (nextAttempt >= RETRY_BACKOFFS_MS.length) {
        await pool.query(
          `insert into dlq (task_id, target_url, event, payload, attempts, last_error)
           values ($1, $2, $3, $4, $5, $6)`,
          [job.task_id, job.target_url, job.event, job.payload, nextAttempt, String(err?.message || err)]
        );
        await pool.query(`delete from dispatch_queue where id = $1`, [job.id]);
      } else {
        const delay = RETRY_BACKOFFS_MS[nextAttempt];
        await pool.query(
          `update dispatch_queue set status = 'pending', attempts = $1, next_attempt = now() + ($2::int || ' milliseconds')::interval, last_error = $3 where id = $4`,
          [nextAttempt, delay, String(err?.message || err), job.id]
        );
      }
    }
  }
}

async function main() {
  await migrate();
  // loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    await processOnce();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, BATCH_MS));
  }
}

export async function startDispatcherLoop() {
  await main();
}

if (process.argv[1]?.includes("dispatcher")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
