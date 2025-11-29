# Deploy Checklist (Coordinator / Agents)

## Core services (coordinator / dispatcher / registry)
- Build context: repo root (`.`)
- Dockerfile path: `coordinator/Dockerfile`
- Build command: leave blank (Dockerfile handles it)
- Start command: optional `node dist/server.js` (Docker CMD already set)
- Deploy from Git/branch in Railway UI (no `railway up`)

## Agents (echo / weather / customs / rail / verify)
- OK to deploy via CLI:
  - `railway up --service agent-echo --path-as-root examples/agent-echo --detach`
  - `railway up --service agent-weather --path-as-root examples/logistics-agents --detach`
  - ...same pattern for customs/rail/verify
- Alternatively, set builder=Dockerfile and Dockerfile path to the example’s Dockerfile; root dir can be repo root.

## Health checks
- Coordinator: `curl -H "x-api-key:<key>" https://coord.nooterra.ai/health`
- Workflows: publish a priced logistics DAG, then GET `/v1/workflows/:id` and ensure all nodes success.
- Ledger: `select owner_did,balance from ledger_accounts order by owner_did;`

## Do & Don’t
- DO: use Git + Dockerfile for coordinator/dispatcher/registry.
- DO: use `railway up --path-as-root` for agents only.
- DON’T: run `railway up` on coordinator/dispatcher/registry (causes root/Dockerfile mismatch).
