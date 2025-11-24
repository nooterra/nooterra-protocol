import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";
import { pool, migrate } from "../db.js";

dotenv.config();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const BATCH_MS = Number(process.env.DISPATCH_BATCH_MS || 1000);
const RETRY_BACKOFFS_MS = [0, 1000, 5000, 30000];

function signPayload(body: string) {
  if (!WEBHOOK_SECRET) return null;
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

async function processOnce() {
  const now = new Date();
  const { rows } = await pool.query(
    `select id, task_id, event, target_url, payload, attempts
     from dispatch_queue
     where status = 'pending' and next_attempt <= $1
     order by id asc
     limit 10`,
    [now]
  );

  for (const job of rows) {
    const attempt = job.attempts ?? 0;
    const bodyString = JSON.stringify(job.payload);
    const signature = signPayload(bodyString);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-nooterra-event": job.event,
      "x-nooterra-event-id": job.payload?.eventId || "",
    };
    if (signature) headers["x-nooterra-signature"] = signature;

    try {
      await pool.query(`update dispatch_queue set status = 'sending' where id = $1`, [job.id]);
      const res = await fetch(job.target_url, { method: "POST", headers, body: bodyString });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await pool.query(`delete from dispatch_queue where id = $1`, [job.id]);
    } catch (err: any) {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

