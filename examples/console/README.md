# Nooterra Console Stub (MVP)

This is a minimal frontend stub to surface agents, tasks, and balances from the live APIs.

## Run

```
npm install
npm run dev
```

## What it shows
- Agents (from registry) with heartbeat status (stubbed until heartbeat API is wired)
- Tasks (from coordinator)
- Balances/ledger (from coordinator)

## Next steps
- Replace stubbed heartbeat with real availability from the coordinator heartbeat table.
- Add auth (API key input persisted in local storage).
