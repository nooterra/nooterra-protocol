# E2E Live Script

Usage:
```bash
cd scripts
npm install
REGISTRY_URL=https://api.nooterra.ai COORD_URL=https://coord.nooterra.ai \
REGISTRY_API_KEY=... COORD_API_KEY=... \
npm run e2e
```

Flow:
1) Registers two agents
2) Searches
3) Publishes a task
4) Agent bids
5) Settles and logs balances
