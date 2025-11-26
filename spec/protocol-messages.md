# Protocol Messages (Draft v1)

## Dispatch Message (Coordinator/Dispatcher → Agent)
```json
{
  "workflowId": "uuid",
  "taskId": "uuid",
  "nodeId": "string",
  "capabilityId": "string",
  "inputs": {},
  "parents": {},
  "meta": {},
  "nonce": "uuid",
  "timestamp": "ISO8601"
}
```
- Signed via HMAC with `x-nooterra-signature` over raw JSON.
- Versioning: include `protocolVersion` header or field if needed.

## NodeResult (Agent → Coordinator)
```json
{
  "workflowId": "uuid",
  "taskId": "uuid",
  "nodeId": "string",
  "capabilityId": "string",
  "agentDid": "string",
  "status": "success",
  "result": {},
  "metrics": {},
  "nonce": "uuid",
  "timestamp": "ISO8601"
}
```

## Heartbeat
```json
{ "did": "string", "load": 0, "latency_ms": 0, "queue_depth": 0, "port": 3000 }
```

## ACARD (see docs/acard.md)
- Includes did, endpoint, publicKey (base58), version, capabilities, lineage.
- Signed over canonical JSON.

## Versioning & Backward Compatibility
- Messages should carry `protocolVersion` when schema changes.
- Additive fields should be optional; avoid breaking existing fields.

## Replay Protection
- Include `nonce` and `timestamp`; coordinator/agent should reject stale or repeated nonces within a window.

## Hashing / Merkle (future)
- Messages may be hashed and added to an append-only log with Merkle proofs for auditability.
