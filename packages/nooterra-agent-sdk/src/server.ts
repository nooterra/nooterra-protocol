import Fastify from "fastify";
import fetch from "node-fetch";
import { verifySignature } from "./hmac.js";
import type { AgentConfig, HandlerContext, HandlerResult } from "./types.js";

function buildHandlerContext(payload: any): HandlerContext {
  return {
    workflowId: payload.workflowId,
    taskId: payload.taskId ?? payload.workflowId,
    nodeId: payload.nodeId,
    capabilityId: payload.capabilityId,
    inputs: payload.inputs ?? payload.payload ?? {},
    parents: payload.parents ?? {},
    meta: payload.meta ?? {},
  };
}

async function postNodeResult(config: AgentConfig, payload: any, result: HandlerResult) {
  const body = {
    workflowId: payload.workflowId,
    taskId: payload.taskId ?? payload.workflowId,
    nodeId: payload.nodeId,
    capabilityId: payload.capabilityId,
    agentDid: config.did,
    status: "success",
    result: result.result,
    metrics: result.metrics,
  };

  await fetch(`${config.coordinatorUrl}/v1/workflows/nodeResult`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function startHeartbeat(config: AgentConfig, fastifyPort: number) {
  const send = async () => {
    try {
      await fetch(`${config.coordinatorUrl}/v1/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          did: config.did,
          load: 0,
          latency_ms: 0,
          queue_depth: 0,
          port: fastifyPort,
        }),
      });
      config.hooks?.onHeartbeat?.({ ok: true });
    } catch (err) {
      console.debug?.("heartbeat failed", err);
      config.hooks?.onHeartbeat?.({ ok: false, error: err });
    }
  };
  await send();
  return setInterval(send, 10_000);
}

export async function startAgentServer(config: AgentConfig): Promise<void> {
  const fastify = Fastify({ logger: false });
  let receivedCount = 0;
  let lastDispatch: any = null;

  // Keep raw body for HMAC, parse manually
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body as string);
  });

  fastify.post("/nooterra/node", async (request, reply) => {
    const raw = (request.body as string) ?? "";
    const signature = request.headers["x-nooterra-signature"];
    if (!verifySignature(config.webhookSecret, raw, signature)) {
      reply.code(401).send({ ok: false, error: "invalid signature" });
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      reply.code(400).send({ ok: false, error: "invalid json" });
      return;
    }

    const cap = config.capabilities.find((c) => c.id === payload.capabilityId);
    if (!cap) {
      reply.code(404).send({ ok: false, error: "capability not found" });
      return;
    }

    try {
      receivedCount += 1;
      lastDispatch = payload;
      try {
        config.hooks?.onDispatch?.({
          workflowId: payload.workflowId,
          nodeId: payload.nodeId,
          capabilityId: payload.capabilityId,
          payload,
        });
      } catch (hookErr) {
        console.debug?.("onDispatch hook error", hookErr);
      }

      const ctx = buildHandlerContext(payload);
      const result = await cap.handler(ctx);
      await postNodeResult(config, payload, result);
      try {
        config.hooks?.onResult?.({
          workflowId: payload.workflowId,
          nodeId: payload.nodeId,
          capabilityId: payload.capabilityId,
          payload,
          result: result.result,
          metrics: result.metrics,
        });
      } catch (hookErr) {
        console.debug?.("onResult hook error", hookErr);
      }
      reply.send({ ok: true });
    } catch (err: any) {
      try {
        config.hooks?.onError?.({
          workflowId: payload?.workflowId,
          nodeId: payload?.nodeId,
          capabilityId: payload?.capabilityId,
          payload,
          error: err,
        });
      } catch (hookErr) {
        console.debug?.("onError hook error", hookErr);
      }
      reply.code(500).send({ ok: false, error: err?.message ?? "handler_error" });
    }
  });

  fastify.get("/nooterra/health", async (_req, reply) => {
    reply.send({
      ok: true,
      did: config.did,
      capabilities: config.capabilities.map((c) => c.id),
      received_count: receivedCount,
      last_dispatch: lastDispatch,
    });
  });

  const port = Number(config.port ?? 3000);
  await fastify.listen({ port, host: "0.0.0.0" });
  const hb = await startHeartbeat(config, port);

  const onClose = () => clearInterval(hb);
  process.on("SIGINT", () => {
    onClose();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    onClose();
    process.exit(0);
  });
}
