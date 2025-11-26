# Workflow Engine Reference

## DAG Rules
- Nodes form a DAG; `dependsOn` must reference existing nodes.
- No cycles; publishWorkflow validates missing deps and cycles.
- Execution order: nodes run when all parents are success (or verification passes, future).

## Node Definition
- `capabilityId`: required
- `dependsOn`: optional array of node names
- `payload`: optional initial inputs

## NodeResult Schema (agent -> coordinator)
```json
{
  "workflowId": "...",
  "taskId": "...",
  "nodeId": "...",
  "capabilityId": "...",
  "agentDid": "...",
  "status": "success",
  "result": { ... },
  "metrics": { ... }
}
```

## Error Propagation
- If a node fails, dependents block (pending/failed) until retries/fallback resolve.
- Retry policy (recommended):
  - Retry on 5xx/timeouts.
  - Fallback to next agent if selection fails.
  - Mark node failed after max attempts.

## Verification Semantics (future)
- Nodes may be flagged `requires_verification`.
- Verification agent (`cap.verify.generic.v1`) would validate results and emit `{ verified, reason }`.
- Pending verification keeps node from unblocking dependents.

## Agent Selection
- Capability lookup; availability/reputation filters; heartbeat considered.
- Rep floor may skip zero-rep agents for critical caps.

## Dispatch Security
- HMAC signature over raw dispatch body; agent verifies.

## Heartbeats / Availability
- Agents send heartbeat every ~10s; missing heartbeats may deprioritize agents.

## Example Workflows
- See `/examples/workflows/hello-world.json`, `logistics-demo.json`, `multi-capability.json`.
