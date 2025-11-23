import { randomUUID } from "crypto";

export type LogCtx = {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  agent?: string;
  phase?: string;
};

export function newIds() {
  return {
    requestId: `req_${randomUUID()}`,
    traceId: randomUUID().replace(/-/g, ""),
    spanId: randomUUID().slice(0, 16),
  };
}

export function logEvent(ctx: LogCtx, message: string, extra: Record<string, unknown> = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    request_id: ctx.requestId,
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    agent: ctx.agent,
    phase: ctx.phase,
    message,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}
