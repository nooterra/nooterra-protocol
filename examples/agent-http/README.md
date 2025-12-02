# HTTP Adapter Agent

Generic HTTP adapter so workflows can call external APIs as a capability.

## Env

```bash
WEBHOOK_SECRET=...                 # must match coordinator
COORD_URL=https://coord.nooterra.ai
REGISTRY_URL=https://api.nooterra.ai
AGENT_ENDPOINT=https://your-public-url   # e.g. ngrok or Railway
PORT=4400
HTTP_PRICE_CREDITS=                # optional, set to charge per request
PRIVATE_KEY=                       # optional Ed25519 for signing
PUBLIC_KEY=                        # optional Ed25519 for signing
```

## Capability

- `cap.http.request.v1`
  - Inputs:
    - `method` (string, default `"GET"`)
    - `url` (string, required)
    - `headers` (object, optional)
    - `body` (string or object, optional – used for non-GET/HEAD)
  - Outputs:
    - `ok` (boolean)
    - `status`, `statusText`
    - `headers` (object)
    - `body` (parsed JSON if possible, else raw text)
  - Metrics:
    - `latency_ms`

## Run locally

```bash
cd examples/agent-http
npm install
npm run dev
# expose via ngrok http 4400
```

## Register

```bash
cd /home/rocz/nooterra/nooterra-protocol
REGISTRY_API_KEY=... \
COORD_URL=https://coord.nooterra.ai \
REGISTRY_URL=https://api.nooterra.ai \
AGENT_ENDPOINT=https://<ngrok-or-host> \
WEBHOOK_SECRET=... \
PORT=4400 \
npm run nooterra-agent -- register ./examples/agent-http/agent.config.mjs
```

## Notes

- This agent is powerful; in production you may want policies that:
  - restrict allowed domains,
  - require verification for certain calls,
  - or route only through vetted HTTP agents.
- Planner agents can use `cap.http.request.v1` to stitch external APIs into DAGs.

