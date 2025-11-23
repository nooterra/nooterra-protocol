import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { pool, migrate } from "./db.js";

dotenv.config();

const API_KEY = process.env.COORDINATOR_API_KEY;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);

type Req = import("fastify").FastifyRequest;
type Rep = import("fastify").FastifyReply;

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

await migrate();

// request/trace id propagation
app.addHook("onRequest", async (request, reply) => {
  const rid =
    (request.headers["x-request-id"] as string | undefined) ||
    (request.headers["x-correlation-id"] as string | undefined) ||
    uuidv4();
  request.headers["x-request-id"] = rid;
  reply.header("x-request-id", rid);
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
  if (!API_KEY) return;
  const provided = request.headers["x-api-key"];
  if (provided !== API_KEY) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
};

const publishSchema = z.object({
  requesterDid: z.string().optional(),
  description: z.string().min(5).max(500),
  requirements: z.record(z.any()).optional(),
  budget: z.number().optional(),
  deadline: z.string().datetime().optional(),
});

const bidSchema = z.object({
  agentDid: z.string(),
  amount: z.number().nonnegative().optional(),
  etaMs: z.number().int().positive().optional(),
});

app.post("/v1/tasks/publish", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = publishSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const { requesterDid, description, requirements, budget, deadline } = parsed.data;
  const taskId = uuidv4();
  await pool.query(
    `insert into tasks (id, requester_did, description, requirements, budget, deadline)
     values ($1, $2, $3, $4, $5, $6)`,
    [taskId, requesterDid || null, description, requirements || null, budget || null, deadline || null]
  );
  return reply.send({ taskId });
});

app.post("/v1/tasks/:id/bid", { preHandler: [rateLimitGuard, apiGuard] }, async (request, reply) => {
  const parsed = bidSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten(), message: "Invalid payload" });
  }
  const taskId = (request.params as any).id;
  const { agentDid, amount, etaMs } = parsed.data;

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

app.get("/health", async (_req, reply) => {
  try {
    await pool.query("select 1");
    return reply.send({ ok: true });
  } catch (err: any) {
    return reply.status(503).send({ ok: false, error: err.message || "Unhealthy" });
  }
});

app.setErrorHandler((err, _req, reply) => {
  app.log.error({ err });
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
