import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import pino from "pino";
import { pool, migrate } from "./db.js";
import fetch from "node-fetch";
import crypto from "crypto";
import { validateOutputSchema } from "./validation.js";
import { listWorkflows } from "./list-workflows.js";
import { startDispatcherLoop } from "./workers/dispatcher.js";

dotenv.config();

const API_KEY = process.env.COORDINATOR_API_KEY;
const REGISTRY_URL = process.env.REGISTRY_URL || "";
const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY || "";
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const HEARTBEAT_TTL_MS = Number(process.env.HEARTBEAT_TTL_MS || 60_000);
const DISPATCH_BATCH_MS = Number(process.env.DISPATCH_BATCH_MS || 1000);
const RETRY_BACKOFFS_MS = [0, 1000, 5000, 30000];
const DAG_MAX_ATTEMPTS = Number(process.env.DAG_MAX_ATTEMPTS || 3);
const CRITICAL_CAPS = new Set<string>(["cap.customs.classify.v1"]);
const MIN_REP_CRITICAL = Number(process.env.MIN_REP_CRITICAL || 0.0);
const FEEDBACK_WEIGHT = 0.2;
const PAGERANK_DAMPING = 0.85;
const PAGERANK_MIN_REP = 0.01;
const PAGERANK_MAX_ITERS = Number(process.env.REP_MAX_ITERS || 20);
const PAGERANK_TOL = Number(process.env.REP_TOL || 1e-4);
const REP_INTERVAL_MS = Number(process.env.REP_INTERVAL_MS || 0);
const PROTOCOL_FEE_BPS = Number(process.env.PROTOCOL_FEE_BPS || 30); // 0.3% default
const SYSTEM_PAYER = process.env.SYSTEM_PAYER || "did:noot:system";
const VERIFY_MAP: Record<string, string> = {
  "cap.customs.classify.v1": "cap.verify.generic.v1",
  "cap.weather.noaa.v1": "cap.verify.generic.v1",
  "cap.rail.optimize.v1": "cap.verify.generic.v1",
};

function verifySignature(pubDerBase64: string | null, payload: any, signatureB64: string) {
  if (!pubDerBase64) return false;
  try {
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    return crypto.verify(
      null,
      Buffer.from(payloadStr),
      crypto.createPublicKey({ key: Buffer.from(pubDerBase64, "base64"), format: "der", type: "spki" }),
      Buffer.from(signatureB64, "base64")
    );
  } catch {
    return false;
  }
}

async function computeLatencyMs(started: any, metrics?: any) {
  if (metrics?.latency_ms != null) return Number(metrics.latency_ms);
  if (started) {
    const diff = Date.now() - new Date(started).getTime();
    return diff > 0 ? diff : 0;
  }
  return 0;
}

function hashResult(obj: any) {
  return crypto.createHash("sha256").update(JSON.stringify(obj || {})).digest("hex");
}

async function adjustBalance(agentDid: string, delta: number) {
  await pool.query(
    `insert into ledger_accounts (owner_did, balance)
     values ($1, $2)
     on conflict (owner_did) do update set balance = ledger_accounts.balance + $2, created_at = ledger_accounts.created_at`,
    [agentDid, delta]
  );
}

async function recordLedger(agentDid: string, taskId: string | null, delta: number, meta: any) {
  const acc = await pool.query(
    `select id from ledger_accounts where owner_did = $1`,
    [agentDid]
  );
  if (!acc.rowCount) {
    await pool.query(`insert into ledger_accounts (owner_did, balance) values ($1, 0)`, [agentDid]);
  }
  const accId =
    acc.rowCount && acc.rows[0].id
      ? acc.rows[0].id
      : (await pool.query(`select id from ledger_accounts where owner_did = $1`, [agentDid])).rows[0].id;
  await pool.query(
    `insert into ledger_events (account_id, workflow_id, node_name, delta, reason, meta)
     values ($1, $2, $3, $4, $5, $6)`,
    [accId, meta?.workflowId || null, meta?.nodeId || null, delta, meta?.type || null, meta || null]
  );
}

async function updateAgentStatsAndRep(agentDid: string, success: boolean, latencyMs: number) {
  if (!agentDid) return;
  // update stats
  const res = await pool.query(
    `select tasks_success, tasks_failed, avg_latency_ms from agent_stats where agent_did = $1`,
    [agentDid]
  );
  let successCount = res.rowCount ? Number(res.rows[0].tasks_success) : 0;
  let failCount = res.rowCount ? Number(res.rows[0].tasks_failed) : 0;
  let avgLatency = res.rowCount ? Number(res.rows[0].avg_latency_ms) : 0;
  if (success) successCount += 1;
  else failCount += 1;
  const total = successCount + failCount;
  const newAvg = total > 0 ? (avgLatency * (total - 1) + latencyMs) / total : latencyMs;

  await pool.query(
    `insert into agent_stats (agent_did, tasks_success, tasks_failed, avg_latency_ms, last_updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (agent_did)
     do update set tasks_success = $2, tasks_failed = $3, avg_latency_ms = $4, last_updated_at = now()`,
    [agentDid, successCount, failCount, newAvg]
  );

  // compute simple rep: 0.7 * successRate + 0.3 * latencyScore
  const successRate = (successCount + 1) / (successCount + failCount + 2);
  const latencyScore = 1 / Math.log10((newAvg || 1) + 10); // ~0-1
  const rep = Math.min(1, Math.max(0, 0.7 * successRate + 0.3 * latencyScore));

  await pool.query(
    `insert into agent_reputation (agent_did, reputation, last_updated_at)
     values ($1, $2, now())
     on conflict (agent_did) do update set reputation = EXCLUDED.reputation, last_updated_at = now()`,
    [agentDid, rep]
  );
  await pool.query(`update agents set reputation = $1 where did = $2`, [rep, agentDid]);
}

type Req = import("fastify").FastifyRequest;
type Rep = import("fastify").FastifyReply;

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
});

const app = Fastify({
  logger,
  bodyLimit: 512 * 1024, // 512kb
});
await app.register(cors, { origin: CORS_ORIGIN });

await migrate();

// request/trace id propagation
app.addHook("onRequest", async (request, reply) => {
  const rid =
    (request.headers["x-request-id"] as string | undefined) ||
    (request.headers["x-correlation-id"] as string | undefined) ||
    uuidv4();
  request.headers["x-request-id"] = rid;
  reply.header("x-request-id", rid);
  (request as any).startTime = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const rid = (request.headers as any)["x-request-id"];
  const duration = Date.now() - ((request as any).startTime || Date.now());
  app.log.info({
    request_id: rid,
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration_ms: duration,
  });
});

const rateBucket = new Map<string, { count: number; resetAt: number }>();
const rateLimitGuard = async (request: Req, reply: Rep) => {
  const ip =
    (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    request.ip ||
    "unknown";
  const now = Date.now();
  const bucket = rateBucket.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBucket.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    const retry = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
    reply.header("Retry-After", retry);
    return reply.status(429).send({ error: "Rate limit exceeded", retryAfterSeconds: retry });
  }
  bucket.count += 1;
};

const apiGuard = async (request: Req, reply: Rep) => {
  // Allow heartbeat and nodeResult without API key so agents can report liveness/results
  const path = request.url || "";
  if (path.startsWith("/v1/heartbeat") || path.startsWith("/v1/workflows/nodeResult")) return;
  if (!API_KEY || API_KEY.toLowerCase() === "none") return;
  const method = request.method?.toUpperCase() || "";
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (isWrite) {
    const provided = request.headers["x-api-key"];
    if (provided !== API_KEY) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  }
};

const publishSchema = z.object({
  requesterDid: z.string().optional(),
  description: z.string().min(5).max(500),
  requirements: z.record(z.any()).optional(),
  budget: z.number().optional(),
  webhookUrl: z.string().url().optional(),
  deadline: z.string().datetime().optional(),
});

const bidSchema = z.object({
  agentDid: z.string(),
  amount: z.number().nonnegative().optional(),
  etaMs: z.number().int().positive().optional(),
});

const settleSchema = z.object({
  payouts: z
    .array(
      z.object({
        agentDid: z.string(),
        amount: z.number().nonnegative(),
      })
    )
    .optional(),
});

const feedbackSchema = z.object({
  workflowId: z.string().uuid().optional(),
  nodeName: z.string().optional(),
  toDid: z.string(),
  quality: z.number().min(0).max(1).optional(),
  latency: z.number().min(0).max(1).optional(),
  reliability: z.number().min(0).max(1).optional(),
  comment: z.string().max(500).optional(),
});

const endorseSchema = z.object({
  fromDid: z.string(),
  toDid: z.string(),
  weight: z.number().min(0).max(5).optional(),
  timestamp: z.string().optional(),
  signature: z.string(),
});

// Simple PageRank over endorsements + feedback graph
async function computePageRank() {
  const { rows } = await pool.query(`select did from agents`);
  if (!rows.length) return;
  const dids = rows.map((r: any) => r.did);
  const index = new Map<string, number>();
  dids.forEach((d, i) => index.set(d, i));

  // Gather edges: endorsements + feedback (toDid from feedback)
  const edgeRows = await pool.query(
    `select from_did, to_did, weight from agent_endorsements
     union all
     select coalesce(from_did,'system') as from_did, to_did, coalesce(quality,0.5) as weight
     from feedback where to_did is not null`
  );

  const n = dids.length;
  const outCounts = new Array(n).fill(0);
  const edges: Array<[number, number, number]> = [];
  for (const e of edgeRows.rows) {
    const i = index.get(e.from_did);
    const j = index.get(e.to_did);
    if (i == null || j == null) continue;
    const w = Number(e.weight || 1);
    edges.push([i, j, w]);
    outCounts[i] += w;
  }

  let rank = new Array(n).fill(1 / n);
  for (let iter = 0; iter < PAGERANK_MAX_ITERS; iter++) {
    const next = new Array(n).fill((1 - PAGERANK_DAMPING) / n);
    for (const [i, j, w] of edges) {
      const denom = outCounts[i] || 1;
      next[j] += (PAGERANK_DAMPING * rank[i] * w) / denom;
    }
    // normalize
    const sum = next.reduce((s, v) => s + v, 0);
    for (let k = 0; k < n; k++) next[k] = next[k] / (sum || 1);
    const delta = next.reduce((s, v, k) => s + Math.abs(v - rank[k]), 0);
    rank = next;
    if (delta < PAGERANK_TOL) break;
  }

  // clamp and persist
  for (let k = 0; k < n; k++) {
    const rep = Math.max(PAGERANK_MIN_REP, Math.min(1, rank[k]));
    const did = dids[k];
    await pool.query(
      `insert into agent_reputation (agent_did, reputation, last_updated_at)
       values ($1, $2, now())
       on conflict (agent_did) do update set reputation = $2, last_updated_at = now();`,
      [did, rep]
    );
    await pool.query(`update agents set reputation = $1 where did = $2`, [rep, did]);
  }
  return rank;
}

const heartbeatSchema = z.object({
  did: z.string(),
  load: z.number().min(0).max(1).default(0),
  latency_ms: z.number().int().nonnegative().default(0),
  queue_depth: z.number().int().nonnegative().default(0),
});

const discoverQuerySchema = z.object({
  capabilityId: z.string().optional(),
  q: z.string().optional(),
  minReputation: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const resultSchema = z.object({
  result: z.any().optional(),
  error: z.string().optional(),
  metrics: z
    .object({
      latency_ms: z.number().int().nonnegative().optional(),
      tokens_used: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const workflowPublishSchema = z.object({
  intent: z.string().optional(),
  payerDid: z.string().optional(),
  maxCents: z.number().int().nonnegative().optional(),
  nodes: z.record(
    z.object({
      capabilityId: z.string(),
      dependsOn: z.array(z.string()).optional(),
      payload: z.record(z.any()).optional(),
    })
  ),
});

const nodeResultSchema = z.object({
  workflowId: z.string(),
  nodeId: z.string(),
  resultId: z.string().uuid().optional(),
  signature: z.string().optional(),
  result: z.any().optional(),
  error: z.string().optional(),
  metrics: z
    .object({
      latency_ms: z.number().int().nonnegative().optional(),
      tokens_used: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

type WebhookPayload = Record<string, any>;
type WebhookTarget = { target_url: string; event: string };

function signPayload(body: string) {
  if (!WEBHOOK_SECRET) return null;
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

async function pushReputation(agentDid: string, reputation: number) {
  if (!REGISTRY_URL || !REGISTRY_API_KEY) return;
  try {
    await fetch(`${REGISTRY_URL}/v1/agent/reputation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": REGISTRY_API_KEY,
      },
      body: JSON.stringify({ did: agentDid, reputation }),
    });
  } catch (err) {
    app.log.error({ err, agentDid }, "Failed to push reputation to registry");
  }
}

async function getAvailabilityScore(agentDid: string) {
  const res = await pool.query<{ availability_score: number | null; last_seen: Date; latency_ms: number | null; load: number | null; queue_depth: number | null }>(
    `select availability_score, last_seen, latency_ms, load, queue_depth from heartbeats where agent_did = $1`,
    [agentDid]
  );
  if (!res.rowCount) return 0;
  const { availability_score, last_seen } = res.rows[0];
  const stale = Date.now() - new Date(last_seen).getTime() > HEARTBEAT_TTL_MS * 2;
  return stale ? 0 : Number(availability_score || 0);
}

function computeAvailability(load: number, queueDepth: number, latencyMs: number) {
  const normalizedLatency = Math.min(1, latencyMs / 1000);
  const score = 1 - load * 0.4 - queueDepth * 0.2 - normalizedLatency * 0.4;
  return Math.max(0, Math.min(1, score));
}

const eventSubscribers = new Set<any>();
function emitEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of eventSubscribers) {
    try {
      res.write(payload);
    } catch {
      // drop dead subscribers
      eventSubscribers.delete(res);
    }
  }
}

async function dispatchWebhooks(taskId: string, event: string, payload: WebhookPayload) {
  const res = await pool.query<WebhookTarget>(
    `select target_url, event from webhooks where task_id = $1 and event = $2`,
    [taskId, event]
  );
  const targets = res.rows;
  const basePayload = {
    event,
    taskId,
    timestamp: new Date().toISOString(),
    eventId: uuidv4(),
    data: payload,
  };
  for (const t of targets) {
    await pool.query(
      `insert into dispatch_queue (task_id, event, target_url, payload, attempts, next_attempt, status)
       values ($1, $2, $3, $4, 0, now(), 'pending')`,
      [taskId, t.event, t.target_url, basePayload]
    );
  }
}

// ---- DAG helpers ----
type WorkflowNode = {
  name: string;
  capabilityId: string;
  dependsOn: string[];
  payload?: Record<string, any>;
};

async function createWorkflow(
  intent: string | undefined,
  nodes: Record<string, WorkflowNode>,
  payerDid?: string,
  maxCents?: number
) {
  const workflowId = uuidv4();
  const taskId = uuidv4();
  // create root task to reuse existing ledger/feedback infra
  await pool.query(
    `insert into tasks (id, description, status) values ($1, $2, 'open')`,
    [taskId, intent || "workflow"]
  );
  await pool.query(
    `insert into workflows (id, task_id, intent, status, payer_did, max_cents, spent_cents)
     values ($1, $2, $3, 'pending', $4, $5, 0)`,
    [workflowId, taskId, intent || null, payerDid || SYSTEM_PAYER, maxCents ?? null]
  );
  for (const [name, node] of Object.entries(nodes)) {
    await pool.query(
      `insert into task_nodes (id, workflow_id, name, capability_id, status, depends_on, payload, max_attempts, requires_verification)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(),
        workflowId,
        name,
        node.capabilityId,
        node.dependsOn.length === 0 ? "ready" : "pending",
        node.dependsOn,
        node.payload || {},
        DAG_MAX_ATTEMPTS,
        CRITICAL_CAPS.has(node.capabilityId),
      ]
    );
  }
  await orchestrateWorkflow(workflowId);
  emitEvent("WORKFLOW_PUBLISHED", { workflowId, taskId, intent, nodes: Object.keys(nodes) });
  return { workflowId, taskId };
}

async function getReadyNodes(workflowId: string) {
  const res = await pool.query(
    `select n.id, n.name, n.capability_id, n.depends_on, n.payload, n.status, n.attempts
     from task_nodes n
     where n.workflow_id = $1
       and (n.status = 'pending' or n.status = 'ready')`,
    [workflowId]
  );
  const rows = res.rows;
  if (!rows.length) return [];
  const successRes = await pool.query(
    `select name from task_nodes where workflow_id = $1 and status = 'success'`,
    [workflowId]
  );
  const successSet = new Set(successRes.rows.map((r: any) => r.name));
  const ready = rows.filter((row: any) => row.depends_on.every((d: string) => successSet.has(d)));
  return ready;
}

async function enqueueNode(node: any, workflowId: string) {
  // gather parent outputs
  const parents = node.depends_on || [];
  let parentOutputs: Record<string, any> = {};
  if (parents.length) {
    const res = await pool.query(
      `select name, result_payload from task_nodes where workflow_id = $1 and name = any($2::text[])`,
      [workflowId, parents]
    );
    parentOutputs = Object.fromEntries(res.rows.map((r: any) => [r.name, r.result_payload || {}]));
  }
  const inputs = { ...(node.payload || {}), parents: parentOutputs };

  const basePayload = {
    workflowId,
    nodeId: node.name,
    capabilityId: node.capability_id,
    inputs,
    eventId: uuidv4(),
    timestamp: new Date().toISOString(),
  };
  const taskId = (await pool.query(`select task_id from workflows where id = $1`, [workflowId])).rows[0].task_id;

  // Budget pre-check: if adding this node's price would exceed max_cents, fail it immediately
  const wfBudget = await pool.query(
    `select max_cents, spent_cents from workflows where id = $1`,
    [workflowId]
  );
  const wfRow = wfBudget.rowCount ? wfBudget.rows[0] : null;
  if (wfRow && wfRow.max_cents != null) {
    const priceRes = await pool.query(
      `select price_cents from capabilities where capability_id = $1 limit 1`,
      [node.capability_id]
    );
    const price = priceRes.rowCount ? Number(priceRes.rows[0].price_cents || 0) : 0;
    if (price > 0 && Number(wfRow.spent_cents || 0) + price > Number(wfRow.max_cents)) {
      await pool.query(`update task_nodes set status = 'failed', updated_at = now() where id = $1`, [node.id]);
      emitEvent("NODE_FAILED", { workflowId, nodeId: node.name, reason: "budget_exceeded" });
      return;
    }
  }

  // select the top agent for the capability (simple MVP selection)
  const agentRes = await pool.query(
    `select a.did, a.endpoint,
            coalesce(ar.reputation, a.reputation, 0) as rep,
            coalesce(hb.availability_score, 0) as avail
     from agents a
     join capabilities c on c.agent_did = a.did
     left join agent_reputation ar on ar.agent_did = a.did
     left join heartbeats hb on hb.agent_did = a.did
     where c.capability_id = $1
       and (hb.last_seen is null or hb.last_seen > now() - interval '${HEARTBEAT_TTL_MS} milliseconds')
       and (coalesce(ar.reputation, a.reputation, 0) >= $2)
     order by coalesce(ar.reputation, a.reputation, 0) desc nulls last,
              coalesce(hb.availability_score, 0) desc nulls last
     limit 1`,
    [node.capability_id, CRITICAL_CAPS.has(node.capability_id) ? MIN_REP_CRITICAL : 0]
  );
  if (!agentRes.rowCount) {
    app.log.error({ capability: node.capability_id, workflowId, node: node.name }, "no agent available for cap");
    // if this is a verify node and no verifier registered, fall back to automatic success
    if (node.capability_id === "cap.verify.generic.v1") {
      const verifyResult = { verified: true, parents: parentOutputs };
      await pool.query(
        `update task_nodes
           set status = 'success',
               result_payload = $1,
               result_hash = $2,
               attempts = attempts + 1,
               finished_at = now(),
               updated_at = now()
         where id = $3`,
        [verifyResult, hashResult(verifyResult), node.id]
      );
      emitEvent("NODE_SUCCESS", { workflowId, nodeId: node.name });
      await orchestrateWorkflow(workflowId);
      return;
    }
    // no agent available; mark failed
    await pool.query(`update task_nodes set status = 'failed', updated_at = now() where id = $1`, [node.id]);
    emitEvent("NODE_FAILED", { workflowId, nodeId: node.name, reason: "no agent" });
    return;
  }
  const target = agentRes.rows[0].endpoint;
  const agentDid = agentRes.rows[0].did;
  const dispatchKey = `${workflowId}:${node.name}:${node.attempts || 0}`;
  await pool.query(
    `insert into dispatch_queue (task_id, workflow_id, node_id, event, target_url, payload, attempts, next_attempt, status, dispatch_key)
     values ($1, $2, $3, $4, $5, $6, 0, now(), 'pending', $7)
     on conflict (dispatch_key) do nothing`,
    [taskId, workflowId, node.name, "node.dispatch", target, basePayload, dispatchKey]
  );

  await pool.query(
    `update task_nodes set status = 'dispatched', updated_at = now(), started_at = now(), agent_did = $2 where id = $1`,
    [node.id, agentDid]
  );
  emitEvent("NODE_DISPATCHED", { workflowId, nodeId: node.name, capabilityId: node.capability_id });
}

async function orchestrateWorkflow(workflowId: string) {
  const readyNodes = await getReadyNodes(workflowId);
  if (!readyNodes.length) return;
  // mark as ready
  const ids = readyNodes.map((r: any) => r.id);
  await pool.query(`update task_nodes set status = 'ready', updated_at = now() where id = any($1::uuid[])`, [ids]);
  for (const node of readyNodes) {
    await enqueueNode(node, workflowId);
  }
}

app.post("/v1/tasks/publish", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = publishSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const { requesterDid, description, requirements, budget, deadline, webhookUrl } = parsed.data;
  const taskId = uuidv4();
  await pool.query(
    `insert into tasks (id, requester_did, description, requirements, budget, deadline)
     values ($1, $2, $3, $4, $5, $6)`,
    [taskId, requesterDid || null, description, requirements || null, budget || null, deadline || null]
  );
  if (webhookUrl) {
    await pool.query(
      `insert into webhooks (task_id, target_url, event) values ($1, $2, $3)`,
      [taskId, webhookUrl, "task.created"]
    );
  }
  emitEvent("TASK_PUBLISHED", { taskId, description, budget });
  // enqueue webhooks for future listeners
  void dispatchWebhooks(taskId, "task.created", { taskId, description, requirements, budget, deadline });
  return reply.send({ taskId });
});

app.post("/v1/tasks/:id/bid", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = bidSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const taskId = (request.params as any).id;
  const { agentDid, amount, etaMs } = parsed.data;

  void recordHeartbeat(agentDid, 0, etaMs ?? 0, 0);

  const task = await pool.query(`select status from tasks where id = $1`, [taskId]);
  if (!task.rowCount) return reply.status(404).send({ error: "Task not found" });
  if (task.rows[0].status !== "open") return reply.status(400).send({ error: "Task closed" });

  await pool.query(
    `insert into bids (task_id, agent_did, amount, eta_ms) values ($1, $2, $3, $4)`,
    [taskId, agentDid, amount ?? null, etaMs ?? null]
  );

  // Update winner to lowest amount (tie-break: earliest)
  const ttlMs = HEARTBEAT_TTL_MS * 2;
  await pool.query(
    `update tasks t set winner_did = sub.agent_did
     from (
       select b.agent_did
       from bids b
       left join heartbeats h on h.agent_did = b.agent_did
       where b.task_id = $1
         and coalesce(h.availability_score,0) >= 0.3
         and (h.last_seen is null or now() - h.last_seen < ($2::int || ' milliseconds')::interval)
       order by b.amount nulls last, coalesce(h.latency_ms, 999999) asc, b.created_at asc
       limit 1
     ) sub
     where t.id = $1`,
    [taskId, ttlMs]
  );

  void dispatchWebhooks(taskId, "bid.received", { taskId, agentDid, amount, etaMs });
  emitEvent("AGENT_BID", { taskId, agentDid, amount });
  return reply.send({ ok: true });
});

app.get("/v1/tasks/:id", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const taskId = (request.params as any).id;
  const task = await pool.query(
    `select id, requester_did, description, requirements, budget, deadline, status, winner_did, created_at
     from tasks where id = $1`,
    [taskId]
  );
  if (!task.rowCount) return reply.status(404).send({ error: "Task not found" });

  const bids = await pool.query(
    `select agent_did, amount, eta_ms, created_at from bids where task_id = $1 order by created_at asc`,
    [taskId]
  );

  return reply.send({ task: task.rows[0], bids: bids.rows });
});

app.get("/v1/tasks", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const limit = Math.min(200, Math.max(1, Number((request.query as any)?.limit || 50)));
  const rows = await pool.query(
    `select id, description, status, winner_did, budget, created_at
     from tasks
     order by created_at desc
     limit $1`,
    [limit]
  );
  return reply.send({ tasks: rows.rows });
});

// Agent discovery (SDN v1 lightweight)
app.get("/v1/discover", { preHandler: [rateLimitGuard] }, async (request, reply) => {
  const parsed = discoverQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid query" });
  }
  const { capabilityId, q, minReputation, limit } = parsed.data;
  const lim = limit ?? 10;
  const minRep = minReputation ?? 0;

  const where: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (capabilityId) {
    where.push(`c.capability_id = $${idx++}`);
    params.push(capabilityId);
  }
  if (q) {
    where.push(`(c.capability_id ilike $${idx} or c.description ilike $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }
  where.push(`coalesce(ar.reputation, a.reputation, 0) >= $${idx++}`);
  params.push(minRep);
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  const sql = `
    select
      a.did,
      a.endpoint,
      c.capability_id,
      c.description,
      coalesce(ar.reputation, a.reputation, 0) as reputation,
      coalesce(hb.availability_score, 0) as availability,
      hb.last_seen,
      hb.latency_ms,
      hb.queue_depth
    from capabilities c
    join agents a on a.did = c.agent_did
    left join agent_reputation ar on ar.agent_did = a.did
    left join heartbeats hb on hb.agent_did = a.did
    ${whereSql}
    order by
      coalesce(ar.reputation, a.reputation, 0) desc nulls last,
      coalesce(hb.availability_score, 0) desc nulls last,
      hb.latency_ms asc nulls last
    limit $${idx}
  `;
  params.push(lim);

  const res = await pool.query(sql, params);
  const results = res.rows.map((row: any) => {
    const stale = row.last_seen ? Date.now() - new Date(row.last_seen).getTime() > HEARTBEAT_TTL_MS * 2 : false;
    return {
      did: row.did,
      endpoint: row.endpoint,
      capabilityId: row.capability_id,
      description: row.description,
      reputation: Number(row.reputation || 0),
      availability: stale ? 0 : Number(row.availability || 0),
      latency_ms: row.latency_ms ?? null,
      queue_depth: row.queue_depth ?? null,
      last_seen: row.last_seen,
      stale,
    };
  });

  return reply.send({ results, count: results.length });
});

app.post("/v1/tasks/:id/settle", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parse = settleSchema.safeParse(request.body || {});
  if (!parse.success) {
    return reply.status(400).send({ error: parse.error.flatten(), message: "Invalid payload" });
  }
  const taskId = (request.params as any).id;
  const task = await pool.query(`select winner_did, budget from tasks where id = $1`, [taskId]);
  if (!task.rowCount) return reply.status(404).send({ error: "Task not found" });
  const winner = task.rows[0].winner_did;
  if (!winner) return reply.status(400).send({ error: "No winner selected" });
  const budget = task.rows[0].budget || 0;
  const payouts = parse.data.payouts || [{ agentDid: winner, amount: budget }];

  // optional result processing
  const maybeResult = resultSchema.safeParse((request.body as any)?.result ? { result: (request.body as any).result, error: (request.body as any).error, metrics: (request.body as any).metrics } : (request.body as any));
  if (maybeResult.success && (maybeResult.data.result || maybeResult.data.error)) {
    let hash = "";
    let schemaValid = true;
    let schemaErrors: any = null;
    try {
      hash = crypto.createHash("sha256").update(JSON.stringify(maybeResult.data.result || maybeResult.data.error)).digest("hex");
      // validate against capability schema if available
      const capabilityId = (request.body as any)?.capabilityId || "";
      if (capabilityId && REGISTRY_URL) {
        const validation = await validateOutputSchema(REGISTRY_URL, capabilityId, maybeResult.data.result ?? {});
        schemaValid = validation.valid;
        schemaErrors = validation.errors || null;
      }
    } catch (err) {
      // ignore
    }
    await pool.query(
      `insert into task_results (task_id, result, error, metrics, hash) values ($1, $2, $3, $4, $5)`,
      [taskId, maybeResult.data.result ?? null, maybeResult.data.error ?? null, maybeResult.data.metrics ?? null, hash || null]
    );
    if (!schemaValid) {
      emitEvent("TASK_RESULT_INVALID", { taskId, capabilityId: (request.body as any)?.capabilityId, errors: schemaErrors });
      return reply.status(400).send({ error: "Result failed schema validation", details: schemaErrors });
    }
  }

  for (const p of payouts) {
    await pool.query(
      `insert into balances (agent_did, credits) values ($1, $2)
       on conflict (agent_did) do update set credits = balances.credits + excluded.credits, updated_at = now()`,
      [p.agentDid, p.amount]
    );
    await pool.query(
      `insert into ledger (agent_did, task_id, delta, meta) values ($1, $2, $3, $4)`,
      [p.agentDid, taskId, p.amount, JSON.stringify({ reason: "settlement" })]
    );
  }
  await pool.query(`update tasks set status = 'settled' where id = $1`, [taskId]);
  void dispatchWebhooks(taskId, "settlement.finalized", { taskId, payouts });
  emitEvent("TASK_SETTLED", { taskId, payouts });
  return reply.send({ ok: true, paid: payouts });
});

app.get("/v1/balances/:agentDid", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const agentDid = (request.params as any).agentDid;
  const res = await pool.query(`select credits from balances where agent_did = $1`, [agentDid]);
  const credits = res.rowCount ? res.rows[0].credits : 0;
  return reply.send({ agentDid, credits });
});

app.get("/v1/ledger/:agentDid/history", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const agentDid = (request.params as any).agentDid;
  const limit = Math.min(100, Math.max(1, Number((request.query as any)?.limit || 50)));
  const res = await pool.query(
    `select id, task_id, delta, meta, created_at from ledger where agent_did = $1 order by created_at desc limit $2`,
    [agentDid, limit]
  );
  return reply.send({ agentDid, history: res.rows });
});

// ---- Workflow endpoints ----
app.post("/v1/workflows/publish", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = workflowPublishSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid workflow payload" });
  }
  const { intent, nodes, payerDid, maxCents } = parsed.data;
  // validate DAG
  const names = Object.keys(nodes);
  for (const [name, node] of Object.entries(nodes)) {
    const deps = node.dependsOn || [];
    if (deps.includes(name)) {
      return reply.status(400).send({ error: `Node ${name} depends on itself` });
    }
    for (const d of deps) {
      if (!names.includes(d)) return reply.status(400).send({ error: `Node ${name} depends on missing node ${d}` });
    }
  }
  // cycle check
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (n: string): boolean => {
    if (visiting.has(n)) return true;
    if (visited.has(n)) return false;
    visiting.add(n);
    for (const d of nodes[n].dependsOn || []) {
      if (hasCycle(d)) return true;
    }
    visiting.delete(n);
    visited.add(n);
    return false;
  };
  for (const n of names) {
    if (hasCycle(n)) return reply.status(400).send({ error: "Cycle detected in DAG" });
  }

  const wfNodes: Record<string, WorkflowNode> = {};
  for (const [name, node] of Object.entries(nodes)) {
    wfNodes[name] = {
      name,
      capabilityId: node.capabilityId,
      dependsOn: node.dependsOn || [],
      payload: node.payload,
    };
  }
  const { workflowId, taskId } = await createWorkflow(intent, wfNodes, payerDid, maxCents);
  return reply.send({ workflowId, taskId, nodes: Object.keys(nodes) });
});

app.post("/v1/workflows/nodeResult", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = nodeResultSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid node result" });

  const { workflowId, nodeId, result, error, metrics, resultId, signature } = parsed.data;
  const client = await pool.connect();
  let newStatus: "success" | "failed" = "failed";
  let schemaErrors: any = null;
  let schemaValid = true;
  let node: any = null;

  try {
    await client.query("begin");
    const nodeRes = await client.query(
      `select id, capability_id, max_attempts, attempts, agent_did, started_at, requires_verification, result_id
       from task_nodes where workflow_id = $1 and name = $2 for update`,
      [workflowId, nodeId]
    );
    if (!nodeRes.rowCount) throw new Error("node_not_found");
    node = nodeRes.rows[0];

    const incomingResultId = resultId || uuidv4();
    if (node.result_id) {
      if (node.result_id === incomingResultId) {
        await client.query("commit");
        return reply.send({ ok: true, status: node.status, idempotent: true });
      }
      throw new Error("duplicate_result");
    }

    // Signature verification (required when agent has public_key)
    if (node.agent_did) {
      const keyRes = await client.query(`select public_key from agents where did = $1`, [node.agent_did]);
      const pub = keyRes.rowCount ? keyRes.rows[0].public_key : null;
      if (pub) {
        if (!signature) {
          throw new Error("missing_signature");
        }
        const payloadToSign = { workflowId, nodeId, result, error, metrics, resultId: incomingResultId };
        const ok = verifySignature(pub, payloadToSign, signature);
        if (!ok) {
          throw new Error("invalid_signature");
        }
      }
    }

    let schemaValid = true;
    let hash = "";
    try {
      const payloadToHash = result ?? error ?? {};
      hash = crypto.createHash("sha256").update(JSON.stringify(payloadToHash)).digest("hex");
      if (result && REGISTRY_URL) {
        const validation = await validateOutputSchema(REGISTRY_URL, node.capability_id, result);
        schemaValid = validation.valid;
        schemaErrors = validation.errors || null;
      }
    } catch {
      // ignore
    }

    newStatus = !schemaValid || error ? "failed" : "success";
    await client.query(
      `update task_nodes
         set status = $1,
             attempts = attempts + 1,
             result_hash = $2,
             result_payload = $3,
             result_id = $4,
             finished_at = now(),
             updated_at = now()
       where id = $5`,
      [newStatus, hash || null, result ?? error ?? null, incomingResultId, node.id]
    );

    if (newStatus === "success") {
      const wfRes = await client.query(
        `select payer_did, max_cents, spent_cents, task_id from workflows where id = $1 for update`,
        [workflowId]
      );
      if (!wfRes.rowCount) throw new Error("workflow_missing");
      const wf = wfRes.rows[0];

      const priceRes = await client.query(
        `select price_cents from capabilities where capability_id = $1 limit 1`,
        [node.capability_id]
      );
      const priceCents = priceRes.rowCount ? Number(priceRes.rows[0].price_cents || 0) : 0;
      if (priceCents > 0) {
        if (wf.max_cents != null && Number(wf.spent_cents || 0) + priceCents > Number(wf.max_cents)) {
          throw new Error("budget_exceeded");
        }
        const fee = Math.floor((priceCents * PROTOCOL_FEE_BPS) / 10000);
        const payout = priceCents - fee;

        const ensureAccount = async (ownerDid: string) => {
          const res = await client.query(
            `insert into ledger_accounts (owner_did, balance)
               values ($1, 0)
               on conflict (owner_did) do update set owner_did = excluded.owner_did
             returning id`,
            [ownerDid]
          );
          return res.rows[0].id as number;
        };

        const payerAcc = await ensureAccount(wf.payer_did || SYSTEM_PAYER);
        const agentAcc = await ensureAccount(node.agent_did || "unknown");
        const protocolAcc = await ensureAccount("did:noot:protocol");
        const meta = { workflowId, nodeId, capabilityId: node.capability_id };

        await client.query(`update ledger_accounts set balance = balance - $1 where id = $2`, [priceCents, payerAcc]);
        await client.query(
          `insert into ledger_events (account_id, workflow_id, node_name, delta, reason, meta)
           values ($1,$2,$3,$4,$5,$6)`,
          [payerAcc, workflowId, nodeId, -priceCents, "node_charge", meta]
        );

        await client.query(`update ledger_accounts set balance = balance + $1 where id = $2`, [payout, agentAcc]);
        await client.query(
          `insert into ledger_events (account_id, workflow_id, node_name, delta, reason, meta)
           values ($1,$2,$3,$4,$5,$6)`,
          [agentAcc, workflowId, nodeId, payout, "node_credit", meta]
        );

        if (fee > 0) {
          await client.query(`update ledger_accounts set balance = balance + $1 where id = $2`, [fee, protocolAcc]);
          await client.query(
            `insert into ledger_events (account_id, workflow_id, node_name, delta, reason, meta)
             values ($1,$2,$3,$4,$5,$6)`,
            [protocolAcc, workflowId, nodeId, fee, "protocol_fee", meta]
          );
        }

        await client.query(`update workflows set spent_cents = spent_cents + $1 where id = $2`, [priceCents, workflowId]);
      }
    }

    await client.query("commit");
  } catch (err: any) {
    try { await client.query("rollback"); } catch {}
    client.release();
    if (err?.message === "node_not_found") return reply.status(404).send({ error: "Node not found" });
    if (err?.message === "duplicate_result") return reply.status(409).send({ error: "duplicate_result" });
    if (err?.message === "missing_signature") return reply.status(400).send({ error: "missing_signature" });
    if (err?.message === "invalid_signature") return reply.status(400).send({ error: "invalid_signature" });
    if (err?.message === "budget_exceeded") {
      await pool.query(`update workflows set status='failed', updated_at=now() where id = $1`, [workflowId]);
      await pool.query(`update task_nodes set status='failed' where workflow_id=$1 and name=$2`, [workflowId, nodeId]);
      emitEvent("NODE_FAILED", { workflowId, nodeId, reason: "budget_exceeded" });
      return reply.status(402).send({ error: "budget_exceeded" });
    }
    app.log.error({ err, workflowId, nodeId }, "nodeResult failed");
    return reply.status(500).send({ error: "node_result_failed" });
  } finally {
    client.release();
  }

  emitEvent(newStatus === "success" ? "NODE_SUCCESS" : "NODE_FAILED", { workflowId, nodeId, status: newStatus, errors: schemaErrors });

  if (node?.capability_id?.startsWith("cap.verify.") && nodeId.startsWith("verify_")) {
    const targetNode = nodeId.replace(/^verify_/, "");
    const targetRes = await pool.query(
      `select agent_did from task_nodes where workflow_id = $1 and name = $2`,
      [workflowId, targetNode]
    );
    const targetDid = targetRes.rowCount ? targetRes.rows[0].agent_did : null;
    if (targetDid) {
      const weight = newStatus === "success" && (result as any)?.verified !== false ? 1 : -1;
      await pool.query(
        `insert into agent_endorsements (from_did, to_did, weight, created_at)
         values ($1, $2, $3, now())`,
        [node?.agent_did || "system", targetDid, weight]
      );
    }
  }

  const wfStatus = await pool.query(
    `select
      sum(case when status = 'failed' then 1 else 0 end) as failed,
      sum(case when status = 'success' then 1 else 0 end) as success,
      count(*) as total
     from task_nodes where workflow_id = $1`,
    [workflowId]
  );
  const { failed, success, total } = wfStatus.rows[0];
  if (Number(failed) > 0) {
    await pool.query(`update workflows set status = 'failed', updated_at = now() where id = $1`, [workflowId]);
  } else if (Number(success) === Number(total)) {
    await pool.query(`update workflows set status = 'success', updated_at = now() where id = $1`, [workflowId]);
  } else {
    await pool.query(`update workflows set status = 'running', updated_at = now() where id = $1`, [workflowId]);
  }

  const agentDid = node?.agent_did || null;
  const latencyMs = await computeLatencyMs(node?.started_at, metrics);
  await updateAgentStatsAndRep(agentDid, newStatus === "success", latencyMs);

  if (newStatus === "success" && node?.requires_verification) {
    const capVerify = VERIFY_MAP[node.capability_id] || "cap.verify.generic.v1";
    const verifyAvail = await pool.query(
      `select 1 from capabilities where capability_id = $1 limit 1`,
      [capVerify]
    );
    if (verifyAvail.rowCount) {
      const verifyName = `verify_${nodeId}`;
      await pool.query(
        `insert into task_nodes (id, workflow_id, name, capability_id, status, depends_on, payload, max_attempts)
         values ($1, $2, $3, $4, 'ready', $5, $6, $7)
         on conflict do nothing`,
        [
          uuidv4(),
          workflowId,
          verifyName,
          capVerify,
          [nodeId],
          { original_node: nodeId },
          DAG_MAX_ATTEMPTS,
        ]
      );
    } else {
      app.log.warn({ workflowId, nodeId, cap: node.capability_id }, "requires_verification but no verifier registered");
    }
  }

  if (newStatus === "success") await orchestrateWorkflow(workflowId);

  return reply.send({ ok: true, status: newStatus, schemaValid, errors: schemaErrors });
});
app.post("/v1/feedback", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = feedbackSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
  const body = parsed.data;
  if (!body.quality && !body.latency && !body.reliability) {
    return reply.status(400).send({ error: "At least one score (quality/latency/reliability) is required" });
  }
  const fromDid = (request.headers["x-agent-did"] as string) || null;
  await pool.query(
    `insert into feedback (workflow_id, node_name, to_did, from_did, quality, latency, reliability, comment, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
    [body.workflowId || null, body.nodeName || null, body.toDid, fromDid, body.quality, body.latency, body.reliability, body.comment || null]
  );

  // light-touch rep bump: blend feedback average into reputation
  const repRes = await pool.query(`select reputation from agents where did = $1`, [body.toDid]);
  const currentRep = repRes.rowCount ? Number(repRes.rows[0].reputation || 0) : 0;
  const scores = [body.quality, body.latency, body.reliability].filter((x) => x != null) as number[];
  const feedbackScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const newRep = Math.min(1, Math.max(0, (1 - FEEDBACK_WEIGHT) * currentRep + FEEDBACK_WEIGHT * feedbackScore));
  await pool.query(`update agents set reputation = $1 where did = $2`, [newRep, body.toDid]);
  await pool.query(
    `insert into agent_reputation (agent_did, reputation, last_updated_at)
     values ($1, $2, now())
     on conflict (agent_did) do update set reputation = EXCLUDED.reputation, last_updated_at = now()`,
    [body.toDid, newRep]
  );

  return reply.send({ ok: true, reputation: newRep });
});

// Simple endorsement edge to feed PageRank
app.post("/v1/endorse", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = endorseSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
  const { fromDid, toDid, weight, timestamp, signature } = parsed.data;
  // verify signature if we have a public key
  const keyRes = await pool.query(`select public_key from agents where did = $1`, [fromDid]);
  const pub = keyRes.rowCount ? keyRes.rows[0].public_key : null;
  if (pub) {
    const payloadToSign = { fromDid, toDid, weight: weight ?? 1, timestamp: timestamp || "" };
    const ok = verifySignature(pub, payloadToSign, signature);
    if (!ok) return reply.status(400).send({ error: "invalid_signature" });
  }
  await pool.query(
    `insert into agent_endorsements (from_did, to_did, weight) values ($1,$2,$3)`,
    [fromDid || "system", toDid, weight ?? 1]
  );
  return reply.send({ ok: true });
});

// On-demand reputation recompute (PageRank over endorsements + feedback graph)
app.post("/v1/reputation/recompute", { preHandler: [rateLimitGuard, apiGuard] }, async (_req, reply) => {
  try {
    const rank = await computePageRank();
    return reply.send({ ok: true, ranks: rank });
  } catch (err: any) {
    app.log.error({ err }, "reputation recompute failed");
    return reply.status(500).send({ error: err?.message || "reputation recompute failed" });
  }
});

// Agent directory (overview). Use a distinct path to avoid clashes with any other
// route providers that may also register `/v1/agents`.
app.get("/v1/agents/overview", { preHandler: [rateLimitGuard, apiGuard] }, async (_req, reply) => {
  const res = await pool.query(
    `select a.did, a.endpoint,
            coalesce(ar.reputation, a.reputation, 0) as reputation,
            coalesce(s.tasks_success,0) as tasks_success,
            coalesce(s.tasks_failed,0) as tasks_failed,
            coalesce(s.avg_latency_ms,0) as avg_latency_ms,
            hb.last_seen,
            hb.availability_score
       from agents a
  left join agent_reputation ar on ar.agent_did = a.did
  left join agent_stats s on s.agent_did = a.did
  left join heartbeats hb on hb.agent_did = a.did
      order by coalesce(ar.reputation, a.reputation, 0) desc nulls last`
  );
  return reply.send({ ok: true, agents: res.rows });
});

// Agent detail
app.get("/v1/agents/:did", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const did = (request.params as any).did;
  const meta = await pool.query(
    `select a.did, a.endpoint,
            coalesce(ar.reputation, a.reputation, 0) as reputation,
            s.tasks_success, s.tasks_failed, s.avg_latency_ms,
            hb.last_seen, hb.availability_score
       from agents a
  left join agent_reputation ar on ar.agent_did = a.did
  left join agent_stats s on s.agent_did = a.did
  left join heartbeats hb on hb.agent_did = a.did
      where a.did = $1`,
    [did]
  );
  if (!meta.rowCount) return reply.code(404).send({ ok: false, error: "not_found" });
  const caps = await pool.query(
    `select capability_id, description, price_cents
       from capabilities
      where agent_did = $1`,
    [did]
  );
  return reply.send({ ok: true, agent: meta.rows[0], capabilities: caps.rows });
});

app.get("/v1/agents/:did/stats", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const did = (request.params as any).did;
  const stats = await pool.query(
    `select a.did, coalesce(ar.reputation,a.reputation,0) as reputation,
            s.tasks_success, s.tasks_failed, s.avg_latency_ms
     from agents a
     left join agent_stats s on s.agent_did = a.did
     left join agent_reputation ar on ar.agent_did = a.did
     where a.did = $1`,
    [did]
  );
  if (!stats.rowCount) return reply.status(404).send({ error: "Not found" });
  return reply.send(stats.rows[0]);
});

app.get("/v1/workflows/:id", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const workflowId = (request.params as any).id;
  const wf = await pool.query(
    `select id, task_id, intent, status, payer_did, max_cents, spent_cents, created_at, updated_at from workflows where id = $1`,
    [workflowId]
  );
  if (!wf.rowCount) return reply.status(404).send({ error: "Not found" });
  const nodes = await pool.query(
    `select name, capability_id, status, depends_on, attempts, max_attempts, result_hash, result_payload,
            started_at, finished_at, created_at, updated_at, agent_did, requires_verification, verification_status, verified_by
     from task_nodes where workflow_id = $1 order by created_at asc`,
    [workflowId]
  );
  return reply.send({ workflow: wf.rows[0], nodes: nodes.rows });
});

// Budget view for a workflow
app.get("/v1/workflows/:id/budget", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const workflowId = (request.params as any).id;
  const wf = await pool.query(
    `select payer_did, max_cents, spent_cents from workflows where id = $1`,
    [workflowId]
  );
  if (!wf.rowCount) return reply.status(404).send({ error: "Not found" });
  const row = wf.rows[0];
  const max = row.max_cents != null ? Number(row.max_cents) : null;
  const spent = Number(row.spent_cents || 0);
  const remaining = max != null ? Math.max(0, max - spent) : null;
  return reply.send({
    ok: true,
    payerDid: row.payer_did,
    maxCents: max,
    spentCents: spent,
    remainingCents: remaining,
  });
});

app.get("/v1/workflows", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const limit = Math.min(200, Math.max(1, Number((request.query as any)?.limit || 50)));
  const workflows = await listWorkflows(limit);
  return reply.send({ workflows });
});

// Ledger endpoints
app.get("/v1/ledger/accounts", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const { ownerDid } = request.query as any;
  const limit = Math.min(200, Math.max(1, Number((request.query as any)?.limit || 50)));
  const offset = Math.max(0, Number((request.query as any)?.offset || 0));

  const params: any[] = [];
  let where = "";
  if (ownerDid) {
    where = "where owner_did = $1";
    params.push(ownerDid);
  }
  params.push(limit, offset);

  const res = await pool.query(
    `select id, owner_did, balance, currency, created_at
       from ledger_accounts
       ${where}
      order by owner_did
      limit $${params.length-1} offset $${params.length}`,
    params
  );
  return reply.send({ ok: true, accounts: res.rows });
});

app.get("/v1/ledger/accounts/:ownerDid", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const { ownerDid } = request.params as any;
  const acc = await pool.query(
    `select id, owner_did, balance, currency, created_at from ledger_accounts where owner_did = $1`,
    [ownerDid]
  );
  if (!acc.rowCount) return reply.code(404).send({ ok: false, error: "account_not_found" });
  const events = await pool.query(
    `select delta, reason, workflow_id, node_name, created_at
       from ledger_events
      where account_id = $1
      order by created_at desc
      limit 50`,
    [acc.rows[0].id]
  );
  return reply.send({ ok: true, account: acc.rows[0], events: events.rows });
});

app.get("/v1/ledger/events", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const { ownerDid, workflowId, nodeName } = request.query as any;
  const limit = Math.min(200, Math.max(1, Number((request.query as any)?.limit || 50)));
  const offset = Math.max(0, Number((request.query as any)?.offset || 0));

  const params: any[] = [];
  const conds: string[] = [];
  if (workflowId) { conds.push(`e.workflow_id = $${params.length+1}`); params.push(workflowId); }
  if (nodeName)  { conds.push(`e.node_name = $${params.length+1}`); params.push(nodeName); }
  if (ownerDid)  { conds.push(`a.owner_did = $${params.length+1}`); params.push(ownerDid); }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  params.push(limit, offset);

  const res = await pool.query(
    `select e.delta, e.reason, e.workflow_id, e.node_name, e.created_at, a.owner_did
       from ledger_events e
       join ledger_accounts a on a.id = e.account_id
       ${where}
      order by e.created_at desc
      limit $${params.length-1} offset $${params.length}`,
    params
  );
  return reply.send({ ok: true, events: res.rows });
});

// Heartbeat open to all agents (no API key required) to avoid liveness failures
app.post("/v1/heartbeat", { preHandler: [rateLimitGuard] }, async (request, reply) => {
  const parsed = heartbeatSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const { did, load, latency_ms, queue_depth } = parsed.data;
  const score = await recordHeartbeat(did, load, latency_ms, queue_depth);
  emitEvent("AGENT_HEARTBEAT", { agentDid: did, score });
  return reply.send({ ok: true, availability: score });
});

app.get("/v1/agents/:id/health", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const agentDid = (request.params as any).id;
  const res = await pool.query(
    `select agent_did, last_seen, load, latency_ms, queue_depth, availability_score from heartbeats where agent_did = $1`,
    [agentDid]
  );
  if (!res.rowCount) return reply.status(404).send({ error: "Not found" });
  const row = res.rows[0];
  const stale = Date.now() - new Date(row.last_seen).getTime() > HEARTBEAT_TTL_MS * 2;
  return reply.send({ ...row, stale });
});

app.get("/v1/events/stream", async (_req, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.write("\n");
  eventSubscribers.add(reply.raw);
  _req.raw.on("close", () => {
    eventSubscribers.delete(reply.raw);
  });
});

app.get("/health", async (_req, reply) => {
  try {
    await pool.query("select 1");
    return reply.send({ ok: true });
  } catch (err: any) {
    return reply.status(503).send({ ok: false, error: err.message || "Unhealthy" });
  }
});

app.setErrorHandler((err, _req, reply) => {
  const rid = (_req as any)?.headers?.["x-request-id"];
  app.log.error({ err, request_id: rid });
  const status = (err as any).statusCode || 500;
  return reply.status(status).send({
    error: err.message,
    statusCode: status,
    details: (err as any).stack || err,
  });
});

const port = Number(process.env.PORT || 3002);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`Coordinator running on ${port}`);
  if (process.env.RUN_DISPATCHER === "true") {
    startDispatcherLoop().catch((err) => app.log.error({ err }, "Dispatcher loop crashed"));
    app.log.info("Dispatcher loop started in-process (RUN_DISPATCHER=true)");
  }
  // periodic reputation recompute if configured
  if (REP_INTERVAL_MS > 0) {
    setInterval(() => {
      computePageRank().catch((err) => app.log.error({ err }, "rep interval compute failed"));
    }, REP_INTERVAL_MS);
    app.log.info(`Reputation recompute interval enabled: ${REP_INTERVAL_MS}ms`);
  }
});
async function recordHeartbeat(agentDid: string, load: number, latencyMs: number, queueDepth: number) {
  const score = computeAvailability(load, queueDepth, latencyMs);
  await pool.query(
    `insert into heartbeats (agent_did, last_seen, load, latency_ms, queue_depth, availability_score, updated_at)
     values ($1, now(), $2, $3, $4, $5, now())
     on conflict (agent_did) do update set last_seen = now(), load = $2, latency_ms = $3, queue_depth = $4, availability_score = $5, updated_at = now()`,
    [agentDid, load, latencyMs, queueDepth, score]
  );
  // push availability to registry
  if (REGISTRY_URL && REGISTRY_API_KEY) {
    try {
      await fetch(`${REGISTRY_URL}/v1/agent/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": REGISTRY_API_KEY },
        body: JSON.stringify({ did: agentDid, availability: score, last_seen: new Date().toISOString() }),
      });
    } catch (err) {
      app.log.error({ err, agentDid }, "Failed to push availability to registry");
    }
  }
  return score;
}
