# Nooterra Coordinator (MVP)

Minimal coordination service for task publish/bid/select. Uses Postgres for state.

## Endpoints
- `POST /v1/tasks/publish` `{ requesterDid?, description, requirements?, budget?, deadline? }` -> `{ taskId }`
- `POST /v1/tasks/:id/bid` `{ agentDid, amount?, etaMs? }` -> `{ ok: true }`
- `GET /v1/tasks/:id` -> task + bids
- `GET /health`

Guards: optional `COORDINATOR_API_KEY` (header `x-api-key`), in-memory rate limit (60/min default; override with `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`).

## Config
- `POSTGRES_URL` (default `postgres://postgres:postgres@localhost:5432/nooterra`)
- `PORT` (default 3002)
- `COORDINATOR_API_KEY` (optional)
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` (ms)

## Dev
```bash
cd coordinator
npm install
npm run dev
```

## Deploy (Railway pattern)
- Add a new service from this folder.
- Set variables: `POSTGRES_URL`, `PORT=3002`, optional `COORDINATOR_API_KEY`.
- Expose port 3002 on your domain (e.g., `coord.nooterra.ai`).
