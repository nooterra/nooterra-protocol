# Coordinator Deploy Guide

Use this as the canonical way to build and deploy the coordinator (and dispatcher/registry) without breaking paths or Docker context.

## Build strategy
- **Build context:** repo root (`.`).
- **Dockerfile:** `coordinator/Dockerfile`.
- **Copy paths inside Dockerfile:** always use `coordinator/...` (never `src/` alone).

Example Dockerfile (already in repo):
```Dockerfile
FROM node:20-slim
WORKDIR /app
COPY coordinator/package.json coordinator/package-lock.json coordinator/tsconfig.json ./coordinator/
WORKDIR /app/coordinator
RUN npm ci
COPY coordinator/src ./src
RUN npm run build
CMD ["node", "dist/server.js"]
```

## Railway config (coordinator/dispatcher/registry)
- Root directory: `.` (repo root).
- Builder: **Dockerfile**.
- Dockerfile path: `coordinator/Dockerfile`.
- Build command: leave blank (Dockerfile handles it).
- Start command: optional `node dist/server.js` (Docker CMD already set).
- Do **not** use `railway up` for these services; deploy from Git/branch in the UI.

## Agents
- Safe to deploy agents via CLI:
  - `railway up --service agent-echo --path-as-root examples/agent-echo --detach`
  - `railway up --service agent-weather --path-as-root examples/logistics-agents --detach`
  - ...same pattern for customs/rail/verify
- For agents, root dir in UI can be `.` with Dockerfile set to the example’s Dockerfile, or leave blank and use CLI with `--path-as-root`.

## Health checks
- Coordinator: `curl -H "x-api-key:<key>" https://coord.nooterra.ai/health`
- Verify workflows: publish a priced logistics DAG, then GET `/v1/workflows/:id` and check all nodes success.
- Ledger sanity: `select owner_did,balance from ledger_accounts order by owner_did;`

## Do & Don’t
- DO: use Git + Dockerfile for coordinator/dispatcher/registry.
- DO: use `railway up --path-as-root` for agents only.
- DON’T: run `railway up` on coordinator/dispatcher/registry (causes root/Dockerfile mismatch).
