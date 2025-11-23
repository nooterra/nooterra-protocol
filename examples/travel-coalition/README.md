# Travel Coalition Demo

Simulates multi-agent travel bundle creation (flights, hotels, dining, experiences) with carbon optimization.

Run:
```bash
cd examples
npm install
npm run travel
```

Env (optional):
- `REGISTRY_URL` (default `https://api.nooterra.ai`)
- `REGISTRY_API_KEY`
- `NOOTERRA_OFFLINE=1` to run fully local

DAG:
UserIntent → SearchFlights + SearchHotels + SearchExperiences → Dining queries → CandidateBundleAggregation → CarbonOptimization → BundleSelection → Settlement (simulated).

Outputs: three candidate bundles with pricing + CO2 scoring, plus structured logs with request/trace IDs.
