# Demo Assets Checklist (Flash Team – Prod Testnet)

Use this list to capture everything needed for investor/partner demos.

## Workflow Run (current success)
- Latest success workflow: `5198bdd6-d773-4415-8e07-1538414535ea`
- Nodes: extract_manifest (echo), weather_risk (weather), customs_classify (customs), rail_optimize (rail)
- Status: success (all nodes attempt=1)

## Screenshots / Clips
1) Workflow page:
   - `/console/workflows/5198bdd6-d773-4415-8e07-1538414535ea`
   - Show all nodes green with payloads expanded.
2) Agent stats/reputation (SQL output):
   ```sql
   select a.did, a.endpoint, coalesce(s.tasks_success,0) as tasks_success,
          coalesce(s.tasks_failed,0) as tasks_failed, coalesce(s.avg_latency_ms,0) as avg_latency_ms,
          a.reputation
   from agents a
   left join agent_stats s on s.agent_did = a.did
   order by a.reputation desc nulls last;
   ```
   Capture key rows:
   - did:noot:echo -> tasks_success=7, rep≈0.7514
   - did:noot:weather -> tasks_success=7, rep≈0.7464
   - did:noot:customs -> tasks_success=2, rep≈0.6454
   - did:noot:rail -> tasks_success=2, rep≈0.6424
3) Agent logs (Railway):
   - agent-echo: dispatch + nodeResult
   - agent-weather: dispatch + handler output
   - agent-customs: dispatch + handler output
   - agent-rail: dispatch + handler output
4) Coordinator logs:
   - Workflow publish
   - Node successes
5) Dispatcher logs:
   - Job found → dispatch → success

## Talking Points
- 4 independent agents (echo, weather, customs, rail) on real cloud URLs using SDK.
- Coordinator/dispatcher separated; RUN_DISPATCHER=false on coordinator, true on dispatcher.
- HMAC-secured webhooks; heartbeats flowing.
- Reputation/availability gate active; bootstrap rep to allow selection.
- DAG engine executing end-to-end on production testnet.

## Optional Clip
- Short GIF of nodes flipping to success (SSE or manual refresh).
