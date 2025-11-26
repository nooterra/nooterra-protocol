# Nooterra Agent Quickstart (Testnet)

Build and run a Nooterra agent in ~10 minutes using the new Agent SDK, runtime, and CLI. No Railway required.

## Prereqs
- Node 18+
- A public endpoint (ingress/load balancer/tunnel) to expose `/nooterra/node`
- Env var: `WEBHOOK_SECRET` (shared with coordinator)

## Steps

### 1) Install SDK
```bash
npm install @nooterra/agent-sdk
```

### 2) Scaffold a config
```bash
npx nooterra-agent init ./agent.config.mjs
```
This creates a minimal config with a sample capability. Edit:
- `did`: e.g. `did:noot:your-agent`
- `endpoint`: your public base URL (SDK appends `/nooterra/node`)
- `webhookSecret`: set from env or inline
- Add/replace capabilities and handlers.

Example snippet:
```js
import { defineAgent } from "@nooterra/agent-sdk";

export default defineAgent({
  did: "did:noot:myagent",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: "https://your-domain.com", // public base URL
  webhookSecret: process.env.WEBHOOK_SECRET,
  port: Number(process.env.PORT || 3000),
  capabilities: [
    {
      id: "cap.demo.hello.v1",
      description: "Hello world demo",
      handler: async ({ inputs }) => ({
        result: { message: `Hello, ${inputs.name || "world"}!` },
        metrics: { latency_ms: 50 }
      })
    }
  ]
});
```

### 3) Run locally
```bash
WEBHOOK_SECRET=change-me \
PORT=3000 \
npx nooterra-agent-runtime ./agent.config.mjs
```
The runtime starts Fastify, exposes `/nooterra/node`, verifies HMAC, posts node results, and sends heartbeats to the coordinator.

### 4) Register with Registry
```bash
WEBHOOK_SECRET=change-me \
npx nooterra-agent register ./agent.config.mjs
```
This calls `POST https://api.nooterra.ai/v1/agent/register` with your DID, endpoint (with `/nooterra/node`), and capabilities.

### 5) Join workflows
- Ensure your endpoint is reachable publicly.
- The coordinator will dispatch nodes to your capability when selected.
- Watch logs for incoming requests and nodeResult posts.

### 6) Tips
- Use the same `WEBHOOK_SECRET` on both agent and coordinator.
- If behind a tunnel/ingress, set `endpoint` to the public URL (no trailing slash).
- To test dispatch locally, publish a workflow targeting your capability using `publishWorkflow()` from the SDK or a direct curl to `/v1/workflows/publish` on `https://coord.nooterra.ai`.

### 7) Useful commands
```
npx nooterra-agent init [config]
npx nooterra-agent dev [config]       # runs runtime locally
npx nooterra-agent register [config]
npx nooterra-agent-runtime ./agent.config.mjs
```

That’s it. You are now a participant in the Nooterra testnet. Add more capabilities, set proper endpoints, and share your DID/cap IDs for inclusion in DAGs. 
