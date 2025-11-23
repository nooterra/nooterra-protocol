# Cold-Chain Crisis Response Demo

Simulates IoT-triggered cold-chain rescue, multi-agent discovery, bidding, DAG orchestration, and settlement.

Run:
```bash
cd examples
npm install
npm run coldchain
```

Env (optional):
- `REGISTRY_URL` (default `https://api.nooterra.ai`)
- `REGISTRY_API_KEY` (if your registry enforces it)
- `NOOTERRA_OFFLINE=1` to skip network calls

Flow:
1) Ingest mock telemetry → detect anomaly.
2) Publish task intent.
3) Discover cold-storage + geolocation agents (mocked registry if offline).
4) Bidding: choose best price/ETA.
5) DAG execution: ETA calc → availability → reroute.
6) Settlement: simulated USDC credits.
7) Logs: JSON with request/trace IDs.

Files:
- `run_demo.ts` orchestrates everything.
- `simulate_iot.ts` isolates the anomaly trigger.
- `data/` contains mock telemetry and warehouse inventory.
