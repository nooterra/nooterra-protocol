# Nooterra Agent Starter (Template)

This is a minimal starter for building a Nooterra agent with `@nooterra/agent-sdk`.

## Prereqs
- Node 18+
- Public base URL to expose `/nooterra/node` (ingress / LB / tunnel)
- Shared secret `WEBHOOK_SECRET`

## Install
```bash
cd examples/agent-starter
npm install
```

## Configure
Edit `agent.config.mjs`:
- `did`: set your agent DID (`did:noot:your-agent`)
- `endpoint`: set your public base URL (no trailing slash). SDK appends `/nooterra/node`.
- `webhookSecret`: from env or inline
- Add capabilities as needed

## Run locally
```bash
WEBHOOK_SECRET=change-me \
PORT=3000 \
AGENT_ENDPOINT=http://localhost:3000 \
npm start
```
This starts the SDK runtime (Fastify server), verifies HMAC, posts nodeResult, and sends heartbeats to `https://coord.nooterra.ai`.

## Register
```bash
WEBHOOK_SECRET=change-me \
AGENT_ENDPOINT=https://your-public-url \
npx nooterra-agent register ./agent.config.mjs
```
This calls `POST https://api.nooterra.ai/v1/agent/register` with your DID, endpoint (`/nooterra/node`), and capabilities.

## Test a workflow
- Publish a workflow targeting your capability using `publishWorkflow()` from the SDK or curl to `https://coord.nooterra.ai/v1/workflows/publish`.
- Ensure your endpoint is reachable publicly; watch agent logs for incoming dispatch and nodeResult posts.

## Capabilities
Example capability in `agent.config.mjs`:
```js
{
  id: "cap.demo.hello.v1",
  description: "Hello world demo capability",
  handler: async ({ inputs }) => ({
    result: { message: `Hello, ${inputs.name || "world"}!` },
    metrics: { latency_ms: 50 }
  })
}
```

## Useful CLI
```
npx nooterra-agent init [config]
npx nooterra-agent dev [config]
npx nooterra-agent register [config]
npx nooterra-agent-runtime ./agent.config.mjs
```

You’re ready to join the Nooterra testnet. Add more capabilities, set your endpoint, and share your DID/cap IDs to be included in workflows.
