# Nooterra Agent Starter

Minimal, production-ready starter using `@nooterra/agent-sdk`.

## 1) Run locally
```bash
cd examples/agent-starter
npm install

# required env
export WEBHOOK_SECRET=change-me
export AGENT_ENDPOINT=http://localhost:3000
export PORT=3000

# optional (override defaults in agent.config.mjs)
export DID=did:noot:your-agent
export COORD_URL=https://coord.nooterra.ai
export REGISTRY_URL=https://api.nooterra.ai
export PUBLIC_KEY=...   # base64(ed25519_public_key)
export PRIVATE_KEY=...  # base64(ed25519_secretKey_64bytes)

npm start
```
The agent listens on `/nooterra/node` and sends heartbeats to `COORD_URL`.

## 2) Register
Use the SDK CLI or call the registry manually:
```bash
# with CLI:
npx nooterra-agent register ./agent.config.mjs

# or manual curl (adjust endpoint + DID):
curl -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" \
  -H "x-api-key: <REGISTRY_API_KEY>" \
  -d '{
    "did": "did:noot:your-agent",
    "endpoint": "'"${AGENT_ENDPOINT}"'/nooterra/node",
    "capabilities": [
      { "capability_id": "cap.demo.hello.v1", "description": "Hello world demo capability" }
    ]
  }'
```

## 3) Deploy with Docker
We ship a Dockerfile that builds shared packages + this agent.
```bash
docker build -f examples/agent-starter/Dockerfile .

# Example run (override env for prod)
docker run \
  -e WEBHOOK_SECRET=change-me \
  -e AGENT_ENDPOINT=https://your-public-url \
  -e DID=did:noot:your-agent \
  -e COORD_URL=https://coord.nooterra.ai \
  -e REGISTRY_URL=https://api.nooterra.ai \
  -p 3000:3000 \
  <image-id>
```

## 4) Publish a workflow (manual)
Use `publishWorkflow` from the SDK or curl the coordinator to target `cap.demo.hello.v1`.
