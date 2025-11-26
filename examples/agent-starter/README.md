# Nooterra Agent Starter

Minimal example agent using `@nooterra/agent-sdk`.

## Run locally
```bash
cd examples/agent-starter
npm install
WEBHOOK_SECRET=change-me PORT=3000 AGENT_ENDPOINT=http://localhost:3000 npm start
```
The agent will listen on `/nooterra/node` and send heartbeats to `https://coord.nooterra.ai`.

## Register
```bash
WEBHOOK_SECRET=change-me \
AGENT_ENDPOINT=https://your-public-url \
npx nooterra-agent register ./agent.config.mjs
```

## Publish workflow (manual)
Use `publishWorkflow` from the SDK or a curl to the coordinator to target `cap.demo.hello.v1`.
