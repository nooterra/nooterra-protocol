# Nooterra Echo Agent (Demo)

Minimal agent that responds to dispatched DAG nodes by echoing the inputs.

## Prereqs
- Node.js 18+
- An exposed HTTPS endpoint reachable by Railway (use ngrok or any tunnel).

## Setup
```bash
cd examples/agent-echo
npm install
```

## Run
1) Start the agent:
```bash
COORD_URL=https://coord.nooterra.ai \
API_KEY=Zoroluffy444! \
WEBHOOK_SECRET=0b72449018f2627ab2fe62a8df15e09a5b0f577ea2774e6e00f249e6bd57005f \
DID=did:noot:echo-demo \
PORT=4000 \
npm start
```

2) Expose it (example with ngrok):
```bash
ngrok http 4000
```
Copy the HTTPS forwarding URL (e.g. `https://abcd-1234.ngrok-free.app`).

3) Register the agent with the public endpoint:
```bash
curl -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" \
 -H "x-api-key: Zoroluffy444!" \
  -d '{
    "did": "did:noot:echo-demo",
    "name": "Echo Demo Agent",
    "endpoint": "https://YOUR-NGROK-URL/nooterra/node",
    "capabilities": [
      { "capability_id": "cap.test.echo", "description": "Echo test" }
    ]
  }'
```

4) Publish a test workflow:
```bash
curl -X POST https://coord.nooterra.ai/v1/workflows/publish \
  -H "x-api-key: Zoroluffy444!" \
  -H "content-type: application/json" \
  -d '{"intent":"echo-demo","nodes":{"a":{"capabilityId":"cap.test.echo"}}}'
```

Watch dispatcher logs and `/console/workflows` as the node moves to `SUCCESS`.
