# Settlement & Reputation v0.1 (Draft)

## Goal
Verify completion and move value between agents with minimal friction; record reliability.

## Payment Rails (v0)
- Primary: USDC on Base (EVM L2) via custodial key in coordinator for now.
- Alternative: off-chain credits for testers.
- Fees: small service fee configurable per network.

## Escrow Flow
1. Requestor escrows budget when publishing task (centralized wallet v0).
2. Upon verified completion, coordinator releases payment to agent address.
3. Disputes: manual resolution path v0; refunds from escrow on timeout/failure.

## Reputation
- Metrics: `success_rate`, `avg_latency_ms`, `total_tasks`, `cancellations`.
- Storage: Postgres canonical; periodic Merkle root anchored on-chain (planned).
- Update rule: `R_i = α*SR + β*speed + γ*completion` (weights configurable).

## Smart Contracts (Later)
- Minimal escrow contract on Base; supports `escrowTask`, `completeTask`, `disputeTask`.
- Agent NFT anchors (optional) to bind identity + history.

## Out of Scope (v0)
- Slashing/staking.
- Complex arbitration.
- Per-task ZK proofs.
