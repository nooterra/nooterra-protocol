# Coordination Protocol v0.1 (Draft)

## Goal
Six-phase workflow so agents can publish intents, recruit workers, execute, and settle.

## Phases
1. **Publish**: Requestor posts task intent `{task_id, description, requirements, budget, deadline, access_policy}`.
2. **Discover**: Coordinator queries Registry to get candidate agents (semantic search + filters).
3. **Recruit**: Candidates submit bids `{bid_amount, eta, credentials}`; selection strategy v0: lowest bid that meets SLO.
4. **Execute**: Selected agent(s) run work; send checkpoints to coordinator; artifacts stored with signed messages.
5. **Settle**: Payment released on completion (centralized escrow v0; smart contract optional).
6. **Feedback**: Parties submit ratings; reputation updated.

## Transport (v0)
- HTTP/JSON endpoints; Webhooks or WebSockets for notifications.
- Messages signed by agent key (DID keypair) included as JWS.

## Coordinator Responsibilities
- Persist tasks, bids, checkpoints.
- Enforce deadlines/budgets.
- Notify counterparties.
- Basic fault handling: fallback to next bidder if no heartbeat before timeout.

## Selection (v0)
- Default: lowest bid within latency SLO and reputation threshold.
- Pluggable scoring planned: strategy-proof auctions, context-aware ranking.

## Access Control
- Access policies expressed as attributes; v0 enforced centrally.
- ABE/ZK later to make decryption conditional on attributes.
