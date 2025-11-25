# Logistics Demo Agents (Stub)

Three stub agents for a 4-node DAG demo:
- Weather Agent: `cap.weather.noaa.v1`
- Customs Agent: `cap.customs.classify.v1`
- Rail Agent: `cap.rail.optimize.v1`

They each:
- Listen via `agent.listen` (from @nooterra/core).
- Return a stubbed result.
- Send heartbeats.

## Prereqs
- Node.js 18+
- Exposed HTTPS endpoints reachable by Railway (use ngrok for each agent).

## Setup
```bash
cd examples/logistics-agents
npm install
```

## Run agents (separate terminals)
Weather:
```bash
COORD_URL=https://coord.nooterra.ai \
API_KEY=Zoroluffy444! \
WEBHOOK_SECRET=0b72449018f2627ab2fe62a8df15e09a5b0f577ea2774e6e00f249e6bd57005f \
DID=did:noot:weather \
PORT=4100 \
npm run start:weather
```

Customs:
```bash
COORD_URL=https://coord.nooterra.ai \
API_KEY=Zoroluffy444! \
WEBHOOK_SECRET=0b72449018f2627ab2fe62a8df15e09a5b0f577ea2774e6e00f249e6bd57005f \
DID=did:noot:customs \
PORT=4101 \
npm run start:customs
```

Rail:
```bash
COORD_URL=https://coord.nooterra.ai \
API_KEY=Zoroluffy444! \
WEBHOOK_SECRET=0b72449018f2627ab2fe62a8df15e09a5b0f577ea2774e6e00f249e6bd57005f \
DID=did:noot:rail \
PORT=4102 \
npm run start:rail
```

## Expose each agent
In three shells:
```bash
ngrok http 4100   # weather
ngrok http 4101   # customs
ngrok http 4102   # rail
```
Copy the HTTPS URLs for each.

## Register agents (replace NGROK_URLs)
```bash
# Weather
curl -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" \
  -H "x-api-key: Zoroluffy444!" \
  -d '{
    "did": "did:noot:weather",
    "name": "Weather Agent",
    "endpoint": "https://NGROK_WEATHER/nooterra/node",
    "capabilities": [
      { "capability_id": "cap.weather.noaa.v1", "description": "Weather risk stub" }
    ]
  }'

# Customs
curl -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" \
  -H "x-api-key: Zoroluffy444!" \
  -d '{
    "did": "did:noot:customs",
    "name": "Customs Agent",
    "endpoint": "https://NGROK_CUSTOMS/nooterra/node",
    "capabilities": [
      { "capability_id": "cap.customs.classify.v1", "description": "Customs classification stub" }
    ]
  }'

# Rail
curl -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" \
  -H "x-api-key: Zoroluffy444!" \
  -d '{
    "did": "did:noot:rail",
    "name": "Rail Agent",
    "endpoint": "https://NGROK_RAIL/nooterra/node",
    "capabilities": [
      { "capability_id": "cap.rail.optimize.v1", "description": "Rail optimization stub" }
    ]
  }'
```

## Publish 4-node workflow
```bash
curl -X POST https://coord.nooterra.ai/v1/workflows/publish \
  -H "x-api-key: Zoroluffy444!" \
  -H "content-type: application/json" \
  -d '{
    "intent": "logistics-demo",
    "nodes": {
      "extract_manifest": { "capabilityId": "cap.test.echo", "payload": { "container_id": "CNU1234567" } },
      "weather_risk": { "capabilityId": "cap.weather.noaa.v1", "dependsOn": ["extract_manifest"] },
      "customs_classify": { "capabilityId": "cap.customs.classify.v1", "dependsOn": ["extract_manifest"] },
      "rail_optimize": { "capabilityId": "cap.rail.optimize.v1", "dependsOn": ["weather_risk","customs_classify"] }
    }
  }'
```

Watch dispatcher logs and `/console/workflows/:id` as nodes move to SUCCESS with stubbed outputs.
