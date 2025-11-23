# Nooterra Examples

Two end-to-end demo simulations that exercise registry discovery and a simplified CCP flow.

Run from this directory:
```bash
cd examples
npm install
npm run coldchain      # Cold-chain crisis response
npm run travel        # Travel coalition bundling
```

Both demos:
- Generate request/trace IDs on every step (printed JSON).
- Optionally hit the live registry (`REGISTRY_URL`, default `https://api.nooterra.ai`). Set `REGISTRY_API_KEY` if your registry enforces it.
- Run fully offline if `NOOTERRA_OFFLINE=1` or if network fails.

### Folder layout
- `coldchain/` — cold storage rescue DAG + IoT trigger
- `travel-coalition/` — travel bundle orchestration DAG
- `data/` — mock datasets for agents

### Note
Coordinator service is mocked inside the scripts until the coordinator is deployed; DAG execution and bidding are simulated locally with the same shapes as the CCP.
