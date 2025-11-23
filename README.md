# Nooterra
Open coordination rails for AI agents: semantic discovery, task orchestration, and simple settlement across organizations.

## Status
Early draft. This repo hosts protocol specs, SDK scaffolds, and examples that will evolve into the reference implementation.

## Repo Layout
- `docs/internal/positioning.md` — internal positioning/targets.
- `specs/` — protocol drafts: agent cards, discovery, coordination, settlement.
- `sdk/typescript` — TypeScript SDK (`@nooterra/core`) with CLI (alpha).
- `examples/weather-demo` — provider/client showing registry + SDK flow.

## Getting Started (today)
1) Clone: `git clone git@github.com:nooterra/nooterra.git`  
2) Read `docs/internal/positioning.md` for scope/targets.  
3) Read specs in `specs/` to align on interfaces before coding.

## Next Steps (short-term)
- Flesh out Registry service design (TypeScript + Qdrant + Postgres).
- Define Coordinator service interfaces for publish/bid/execute.
- Scaffold SDK (TypeScript first) with register/search/publish/bid helpers.
- Add landing page + docs in sibling repos (`nooterra-website`, `nooterra-docs`).

## Contact
`aiden@nooterra.ai` or open an issue in this repo.
