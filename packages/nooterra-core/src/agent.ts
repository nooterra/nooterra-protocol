import Fastify from "fastify";
import crypto from "crypto";
import fetch from "node-fetch";

export type NodeEvent = {
  workflowId: string;
  taskId?: string;
  nodeId: string;
  capabilityId: string;
  inputs: any;
};

export type AgentListenOpts = {
  coordUrl: string;
  apiKey: string;
  webhookSecret: string;
  port?: number;
  onNode: (event: NodeEvent) => Promise<{ result: any; metrics?: { latency_ms?: number; tokens_used?: number } }>;
  agentDid?: string;
  heartbeatIntervalMs?: number;
  heartbeat?: () => { load?: number; latency_ms?: number; queue_depth?: number };
};

function verifyHmac(body: string, sig: string, secret: string) {
  if (!secret || !sig) return false;
  const h = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return sig === h;
}

async function sendHeartbeat(opts: AgentListenOpts) {
  if (!opts.agentDid) return;
  const body = {
    did: opts.agentDid,
    ...(opts.heartbeat ? opts.heartbeat() : { load: 0, latency_ms: 0, queue_depth: 0 }),
  };
  try {
    await fetch(`${opts.coordUrl.replace(/\/+$/, "")}/v1/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": opts.apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    // ignore
  }
}

export async function listen(opts: AgentListenOpts) {
  const app = Fastify({
    logger: false,
    bodyLimit: 512 * 1024,
  });

  // raw body for signature verification
  app.addHook("preHandler", async (req, _reply) => {
    if (!req.raw.readable) return;
    const chunks: Buffer[] = [];
    for await (const chunk of req.raw) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    (req as any).rawBody = raw;
    try {
      req.body = JSON.parse(raw);
    } catch {
      req.body = {};
    }
  });

  app.post("/nooterra/node", async (req, reply) => {
    const sig = req.headers["x-nooterra-signature"] as string;
    const raw = (req as any).rawBody || JSON.stringify(req.body || {});
    if (!verifyHmac(raw, sig, opts.webhookSecret)) {
      return reply.status(401).send({ error: "invalid signature" });
    }
    const payload = req.body as NodeEvent;
    const start = Date.now();
    try {
      const { result, metrics } = await opts.onNode(payload);
      const latency_ms = metrics?.latency_ms ?? Date.now() - start;
      await fetch(`${opts.coordUrl.replace(/\/+$/, "")}/v1/workflows/nodeResult`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": opts.apiKey },
        body: JSON.stringify({
          workflowId: payload.workflowId,
          taskId: payload.taskId,
          nodeId: payload.nodeId,
          result,
          metrics: { latency_ms, ...(metrics || {}) },
        }),
      });
      return reply.send({ ok: true });
    } catch (err: any) {
      await fetch(`${opts.coordUrl.replace(/\/+$/, "")}/v1/workflows/nodeResult`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": opts.apiKey },
        body: JSON.stringify({
          workflowId: payload.workflowId,
          taskId: payload.taskId,
          nodeId: payload.nodeId,
          error: err?.message || "error",
        }),
      });
      return reply.status(500).send({ error: "handler error" });
    }
  });

  const port = opts.port ?? 3000;
  await app.listen({ port, host: "0.0.0.0" });

  const interval = setInterval(() => void sendHeartbeat(opts), opts.heartbeatIntervalMs ?? 10000);
  return {
    close: async () => {
      clearInterval(interval);
      await app.close();
    },
  };
}
