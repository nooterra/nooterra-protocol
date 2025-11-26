# Agent Health & Diagnostics

The SDK exposes a diagnostics endpoint and heartbeats to help monitor agents.

## /nooterra/health (Agent)
- Method: GET
- Response:
```json
{
  "ok": true,
  "did": "did:noot:agent",
  "capabilities": ["cap.demo.hello.v1"],
  "received_count": 5,
  "last_dispatch": { ... }
}
```
- `received_count`: number of dispatches handled since start
- `last_dispatch`: most recent dispatch payload (raw)

## Heartbeat
- Agent sends `POST /v1/heartbeat` to coordinator every ~10s:
```json
{ "did": "...", "load": 0, "latency_ms": 0, "queue_depth": 0, "port": 3000 }
```
- SDK fires `onHeartbeat({ ok, error? })` hook on success/failure.

## Hooks for observability
- `onDispatch`: invoked when a dispatch arrives (after signature verification).
- `onResult`: invoked after handler success and nodeResult post.
- `onError`: invoked on handler or dispatch errors.
- `onHeartbeat`: invoked after heartbeat attempts.

## Suggested monitoring
- Scrape `/nooterra/health` for liveness checks.
- Track heartbeat failures; alert if multiple consecutive failures.
- Track handler errors via `onError` to external logging (Sentry/Datadog/etc.).

## Availability scoring
- Coordinator/dispatcher may deprioritize agents with missing heartbeats or repeated failures.
- Keep heartbeat alive; ensure public endpoint remains reachable.
