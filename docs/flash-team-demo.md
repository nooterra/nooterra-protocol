# Nooterra Flash Team Demo (Production Testnet)

This script captures the full end-to-end logistics flash team run across four SDK-based agents (echo, weather, customs, rail) on the production testnet.

## Prereqs
- Workflow engine: https://coord.nooterra.ai
- Registry: https://api.nooterra.ai
- Agents live:
  - did:noot:echo → https://agent-echo-production.up.railway.app/nooterra/node
  - did:noot:weather → https://agent-weather-production.up.railway.app/nooterra/node
  - did:noot:customs → https://agent-customs-production.up.railway.app/nooterra/node
  - did:noot:rail → https://agent-rail-production.up.railway.app/nooterra/node
- HMAC shared secret: WEBHOOK_SECRET (already set on agents + coordinator)
- Coordinator dispatcher off; dedicated dispatcher on.

## Workflow Publish (Production)
Publish the 4-node logistics DAG:

```bash
curl -X POST https://coord.nooterra.ai/v1/workflows/publish \
  -H "x-api-key: Zoroluffy444!" \
  -H "content-type: application/json" \
  -d '{
    "intent": "logistics-demo",
    "nodes": {
      "extract_manifest": {
        "capabilityId": "cap.test.echo",
        "payload": { "container_id": "CNU1234567" }
      },
      "weather_risk": {
        "capabilityId": "cap.weather.noaa.v1",
        "dependsOn": ["extract_manifest"]
      },
      "customs_classify": {
        "capabilityId": "cap.customs.classify.v1",
        "dependsOn": ["extract_manifest"]
      },
      "rail_optimize": {
        "capabilityId": "cap.rail.optimize.v1",
        "dependsOn": ["weather_risk", "customs_classify"]
      }
    }
  }'
```

Sample success run: `workflowId: 5198bdd6-d773-4415-8e07-1538414535ea`.

## Live View (Console)
- Open `/console/workflows/<workflowId>` and watch nodes flip to SUCCESS:
  - extract_manifest → did:noot:echo
  - weather_risk → did:noot:weather
  - customs_classify → did:noot:customs
  - rail_optimize → did:noot:rail
- If SSE isn’t wired, refresh periodically.

## Agents View (if available)
Display per agent:
- DID, endpoint, reputation, last heartbeat, capabilities

## Logs to Show (money shots)
1) Agent logs (via Railway):
   - `agent-echo`, `agent-weather`, `agent-customs`, `agent-rail`
   - Show incoming dispatch, handler output, nodeResult post.

2) Coordinator logs:
   - Workflow publish
   - Node dispatched / Node success
   - Workflow success

3) Dispatcher logs:
   - Job found → dispatch node → success

## Payloads to Highlight
- extract_manifest: echoes `{ container_id: "CNU1234567" }`
- weather_risk: `{ advisory: "Heavy rain; potential port congestion", storm_risk: 0.72 }`
- customs_classify: duties/clearance/high_risk_goods payload
- rail_optimize: recommended route and options

## Agent Stats & Reputation (SQL)
```sql
select a.did, a.endpoint, s.tasks_success, s.tasks_failed, s.avg_latency_ms, a.reputation
from agents a
left join agent_stats s on s.agent_did = a.did
order by a.reputation desc nulls last;
```

## Closing Screenshot
- Workflow page with all green checkmarks, total execution time, and node result payloads expanded.
