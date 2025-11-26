# Agent Runtime Protocol (v1)

## Routes (Agent)
- `POST /nooterra/node`
  - Header: `x-nooterra-signature` = HMAC-SHA256(raw body, webhookSecret)
  - Body (dispatch):
    - `workflowId`: string
    - `taskId` (optional): string
    - `nodeId`: string
    - `capabilityId`: string
    - `inputs`: any
    - `parents`: object
    - `meta`: object
  - Responses:
    - 200 `{ ok: true }`
    - 401 on bad signature
    - 404 if capability not found
    - 500 on handler error

- `GET /nooterra/health`
  - `{ ok, did, capabilities, received_count, last_dispatch }`

## Heartbeat
- Agent → Coordinator: `POST /v1/heartbeat`
  - Body: `{ did, load, latency_ms, queue_depth, port? }`
  - Interval: ~10s
  - If heartbeat fails, agent may be deprioritized/marked unavailable.

## Node Result
- Agent → Coordinator: `POST /v1/workflows/nodeResult`
  - Body:
    - `workflowId`
    - `taskId`
    - `nodeId`
    - `capabilityId`
    - `agentDid`
    - `status`: "success" (for now)
    - `result`: any
    - `metrics`: optional

## HMAC Rules
- Sign **raw** JSON body (no prettify, no mutation).
- Header: `x-nooterra-signature`
- Verify with same secret on agent.

## Verification (placeholder)
- `requires_verification` may be set on nodes; verification agent spec pending.
- Future: `cap.verify.generic.v1` to consume original result and emit `{ verified, reason }`.

## Availability / Reputation
- Heartbeats drive availability.
- Reputation considered during agent selection (rep floor for critical caps).

## Retry / Selection
- Dispatcher should retry on 5xx/timeouts; fallback to next agent if selection fails.

## Agent Config (SDK)
- `did, registryUrl, coordinatorUrl, endpoint, webhookSecret, capabilities, port?, hooks?`

This doc defines the contract for any agent runtime (Node, container, etc.) to interoperate with the Nooterra coordinator/dispatcher.
