#!/usr/bin/env bash
set -e

API_KEY="Zoroluffy444!"
WEBHOOK_SECRET="0b72449018f2627ab2fe62a8df15e09a5b0f577ea2774e6e00f249e6bd57005f"

# 1) Run agents (separate terminals) before executing this script.
# Weather: (from examples/logistics-agents) PORT=4100 DID=did:noot:weather npm run start:weather
# Customs: (from examples/logistics-agents) PORT=4101 DID=did:noot:customs npm run start:customs
# Rail:    (from examples/logistics-agents) PORT=4102 DID=did:noot:rail    npm run start:rail

# 2) Expose via ngrok and paste your URLs here:
NGROK_WEATHER="https://YOUR-WEATHER-URL.ngrok-free.app"
NGROK_CUSTOMS="https://YOUR-CUSTOMS-URL.ngrok-free.app"
NGROK_RAIL="https://YOUR-RAIL-URL.ngrok-free.app"

# 3) Register agents
echo "Registering weather..."
curl -s -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"did\":\"did:noot:weather\",\"name\":\"Weather Agent\",\"endpoint\":\"${NGROK_WEATHER}/nooterra/node\",\"capabilities\":[{\"capability_id\":\"cap.weather.noaa.v1\",\"description\":\"Weather risk stub\"}]}"

echo "Registering customs..."
curl -s -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"did\":\"did:noot:customs\",\"name\":\"Customs Agent\",\"endpoint\":\"${NGROK_CUSTOMS}/nooterra/node\",\"capabilities\":[{\"capability_id\":\"cap.customs.classify.v1\",\"description\":\"Customs classification stub\"}]}"

echo "Registering rail..."
curl -s -X POST https://api.nooterra.ai/v1/agent/register \
  -H "content-type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"did\":\"did:noot:rail\",\"name\":\"Rail Agent\",\"endpoint\":\"${NGROK_RAIL}/nooterra/node\",\"capabilities\":[{\"capability_id\":\"cap.rail.optimize.v1\",\"description\":\"Rail optimization stub\"}]}"

# 4) Publish workflow
echo "Publishing logistics workflow..."
curl -s -X POST https://coord.nooterra.ai/v1/workflows/publish \
  -H "x-api-key: ${API_KEY}" \
  -H "content-type: application/json" \
  -d '{"intent":"logistics-demo","nodes":{"extract_manifest":{"capabilityId":"cap.test.echo","payload":{"container_id":"CNU1234567"}},"weather_risk":{"capabilityId":"cap.weather.noaa.v1","dependsOn":["extract_manifest"]},"customs_classify":{"capabilityId":"cap.customs.classify.v1","dependsOn":["extract_manifest"]},"rail_optimize":{"capabilityId":"cap.rail.optimize.v1","dependsOn":["weather_risk","customs_classify"]}}}'

echo
echo "Check /console/workflows for node status."
