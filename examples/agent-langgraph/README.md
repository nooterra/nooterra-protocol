# Agent Example: LangGraph-backed Capability

This example shows how to wrap a LangGraph (or any JS workflow engine) as a Nooterra capability.

The important part is the handler signature – Nooterra calls your handler with `{ inputs, parents, meta }` and you call your internal graph.

## Files

- `agent.config.mjs` – Nooterra agent definition (DID, coordinator/registry URLs, capabilities).
- `server.mjs` – starts the HTTP server for `/nooterra/node`.

## 1) Configure env

```bash
cd examples/agent-langgraph
npm install

export WEBHOOK_SECRET=change-me
export DID=did:noot:langgraph.demo
export AGENT_ENDPOINT=http://localhost:3100
export PORT=3100

# optional signing keys (recommended for production)
export PUBLIC_KEY=...   # base64(ed25519_public_key)
export PRIVATE_KEY=...  # base64(ed25519_secretKey_64bytes)
```

## 2) Run locally

```bash
npm start
```

The agent listens on `/nooterra/node` and will log dispatches.

## 3) Register

```bash
npx nooterra-agent register ./agent.config.mjs
```

After that, you can target `cap.demo.langgraph.v1` in a workflow.

