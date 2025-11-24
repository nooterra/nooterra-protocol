import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import pino from "pino";
import { pool, migrate } from "./db.js";
import fetch from "node-fetch";
import crypto from "crypto";

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
  const method = request.method?.toUpperCase() || "";
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (!API_KEY && !isWrite) return;
  if (API_KEY && isWrite) {
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
  agentDid: z.string(),
  rating: z.number().min(0).max(1),
  comment: z.string().max(500).optional(),
});

const heartbeatSchema = z.object({
  did: z.string(),
  load: z.number().min(0).max(1).default(0),
  latency_ms: z.number().int().nonnegative().default(0),
  queue_depth: z.number().int().nonnegative().default(0),
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

async function recordHeartbeat(agentDid: string) {
  await pool.query(
    `insert into heartbeats (agent_did, last_seen, load, latency_ms, queue_depth, availability_score, updated_at)
     values ($1, now(), 0, 0, 0, 1, now())
     on conflict (agent_did) do update set last_seen = now(), updated_at = now()`,
    [agentDid]
  );
}

async function getAvailabilityScore(agentDid: string) {
  const res = await pool.query<{ availability_score: number | null; last_seen: Date }>(
    `select availability_score, last_seen from heartbeats where agent_did = $1`,
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
      [taskId, webhookUrl, "task.updated"]
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

  void recordHeartbeat(agentDid);

  const task = await pool.query(`select status from tasks where id = $1`, [taskId]);
  if (!task.rowCount) return reply.status(404).send({ error: "Task not found" });
  if (task.rows[0].status !== "open") return reply.status(400).send({ error: "Task closed" });

  await pool.query(
    `insert into bids (task_id, agent_did, amount, eta_ms) values ($1, $2, $3, $4)`,
    [taskId, agentDid, amount ?? null, etaMs ?? null]
  );

  // Update winner to lowest amount (tie-break: earliest)
  await pool.query(
    `update tasks t set winner_did = sub.agent_did
     from (
       select agent_did from bids
       where task_id = $1
       order by amount nulls last, created_at asc
       limit 1
     ) sub
     where t.id = $1`,
    [taskId]
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
    const hash = crypto.createHash("sha256").update(JSON.stringify(maybeResult.data.result || maybeResult.data.error)).digest("hex");
    await pool.query(
      `insert into task_results (task_id, result, error, metrics, hash) values ($1, $2, $3, $4, $5)`,
      [taskId, maybeResult.data.result ?? null, maybeResult.data.error ?? null, maybeResult.data.metrics ?? null, hash]
    );
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

app.post("/v1/tasks/:id/feedback", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = feedbackSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const taskId = (request.params as any).id;
  const task = await pool.query(`select id from tasks where id = $1`, [taskId]);
  if (!task.rowCount) return reply.status(404).send({ error: "Task not found" });

  const { agentDid, rating, comment } = parsed.data;
  await pool.query(
    `insert into feedback (task_id, agent_did, rating, comment) values ($1, $2, $3, $4)`,
    [taskId, agentDid, rating, comment || null]
  );

  const avgRes = await pool.query<{ avg: string | null }>(
    `select avg(rating) as avg from feedback where agent_did = $1`,
    [agentDid]
  );
  const avg = avgRes.rows[0]?.avg ? Number(avgRes.rows[0].avg) : 0;
  void pushReputation(agentDid, Math.max(0, Math.min(1, avg)));

  return reply.send({ ok: true, agentDid, rating, reputation: avg });
});

app.get("/v1/tasks/:id/feedback", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const taskId = (request.params as any).id;
  const rows = await pool.query(
    `select agent_did, rating, comment, created_at from feedback where task_id = $1 order by created_at desc`,
    [taskId]
  );
  return reply.send({ taskId, feedback: rows.rows });
});

app.post("/v1/heartbeat", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = heartbeatSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const { did, load, latency_ms, queue_depth } = parsed.data;
  const score = computeAvailability(load, queue_depth, latency_ms);
  await pool.query(
    `insert into heartbeats (agent_did, last_seen, load, latency_ms, queue_depth, availability_score, updated_at)
     values ($1, now(), $2, $3, $4, $5, now())
     on conflict (agent_did) do update set last_seen = now(), load = $2, latency_ms = $3, queue_depth = $4, availability_score = $5, updated_at = now()`,
    [did, load, latency_ms, queue_depth, score]
  );
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
});
