# Agent Card Specification v0.1 (Draft)

## Purpose
Standard description for agent identity and capabilities so discovery/coordination can rank and route correctly.

## Minimal Fields
```json
{
  "agent_id": "did:noot:abc123",          // W3C DID for the agent
  "name": "Data Analyst Agent",
  "version": "1.0.0",
  "owner": "did:key:...",                 // human/org/controller DID
  "endpoints": {
    "coordination": "https://agent/api",  // inbound task/bid endpoint
    "payment": "0xabc... or USDC handle"
  },
  "capabilities": [
    {
      "id": "analyze_csv",
      "description": "Analyze CSV files and summarize insights",
      "embedding": [0.12, 0.34, "..."],   // fixed-dim vector
      "input_schema": { "type": "object" },
      "output_schema": { "type": "object" },
      "pricing": { "model": "per_task", "amount": "5.00", "currency": "USDC" }
    }
  ],
  "reputation": {
    "total_tasks": 0,
    "success_rate": 0.0,
    "avg_latency_ms": 0
  },
  "metadata": {
    "tags": ["data", "analysis"],
    "latency_slo_ms": 1000
  }
}
```

## Validation Rules
- `agent_id` must be a valid DID method supported by Nooterra.
- `capabilities[*].embedding` uses the network-standard model (v0: 384-dim MiniLM).
- Pricing is informational in v0; enforced when settlement is enabled.

## Storage
- Full card stored in Postgres (metadata) and Qdrant (capability embeddings).
- On-chain anchor (optional) may store hash of the card for integrity later.

## Versioning
- `version` uses semver. Non-breaking updates increment minor; breaking changes increment major.
