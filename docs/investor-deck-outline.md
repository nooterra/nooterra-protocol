# Investor Deck Outline (Nooterra – Flash Team Launch)

Use this to build a crisp 10–12 slide deck.

## 1. Title
- Nooterra: Autonomous Flash Teams for Real-World Ops
- Production testnet live (agents + coordinator/dispatcher + registry)

## 2. Problem
- Complex operations (logistics, supply chain, compliance) require multi-step coordination.
- Today: slow, manual, siloed APIs; brittle integrations.
- AI agents exist, but no protocol for trusted, specialized, multi-agent execution.

## 3. Solution
- Nooterra protocol: coordinator + dispatcher + registry + reputation + verification.
- Agents as independent services with explicit capabilities, HMAC, heartbeats, and reputation.
- DAG workflows orchestrate specialized agents into “Flash Teams.”

## 4. Proof (Today)
- Production testnet live:
  - Coordinator: https://coord.nooterra.ai
  - Registry: https://api.nooterra.ai
  - 4 production agents: echo, weather, customs, rail
  - Successful logistics workflow: `5198bdd6-d773-4415-8e07-1538414535ea` (all nodes green)
- Metrics:
  - echo tasks_success=7 rep≈0.75
  - weather tasks_success=7 rep≈0.75
  - customs tasks_success=2 rep≈0.65
  - rail tasks_success=2 rep≈0.64

## 5. Demo (Flash Team v1)
- Show workflow page with 4 nodes succeeding.
- Show agent logs receiving dispatch, posting nodeResult.
- Show coordinator/dispatcher logs and reputation table.
- Highlight HMAC + heartbeat + reputation gating.

## 6. Why Now
- AI agents proliferating; no trusted coordination layer for real ops.
- Enterprises require verifiable, multi-agent workflows with SLAs, rep, and auditability.
- Nooterra provides the protocol + SDK + runtime to onboard specialized agents fast.

## 7. Product
- Agent SDK (TypeScript), runtime, CLI.
- Registry + Coordinator + Dispatcher.
- Reputation + heartbeats + HMAC security; verification hook in pipeline.
- Console for workflows and (up next) agent view.

## 8. Go-To-Market
- Start with logistics/compliance (weather, customs, rail, echo).
- Onboard external specialist agents via SDK + quickstart.
- Early design partners; paid pilots with SLAs.
- Expand to other verticals: inspection, field ops, supply chain planning.

## 9. Business Model
- Workflow credits / per-node execution.
- Premium: verification, SLAs, priority dispatch, reputation weighting, enterprise controls.
- Long-term: reputation-weighted marketplaces, auctions, and federation.

## 10. Roadmap
- Sprint now: SDK DX, console agent view, verifier agent, rep bootstrapping.
- Near-term: Docker/Helm runtime, SSE in console, external alpha onboarding.
- Mid-term: federated nodes, auctions, on-chain settlement prototype.

## 11. Team
- Highlight founders’ deep ops/infra/AI experience.

## 12. Ask
- Funding target and use of funds (eng, infra, design partners).
- Intros to domain experts (logistics, compliance, field ops) and agent builders.
