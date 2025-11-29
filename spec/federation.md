# Nooterra Federation Spec (Registry & Coordinator Multi‑Node)

## 0. Goals

Enable multiple Nooterra “nodes” (each with their own registry + coordinator + dispatcher + ledger + console) to:

- Discover each other.
- Share agent + capability metadata (ACARDs).
- Route workflows across nodes in a controlled, policy‑driven way.

Without:

- Relying on a single global registry.
- Giving up local policy control.

This spec only covers **federated registry/discovery**. Cross‑node workflow execution and settlement build on top of this.

## 1. Entities & Roles

### 1.1 Node

A **Nooterra Node** is a deployment that hosts:

- Registry (`/v1/agent/*`).
- Coordinator (`/v1/workflows/*`, `/v1/discover`).
- Dispatcher (internal worker).
- Ledger.
- Console.

Identified by:

```json
{
  "nodeId": "nootnode:did:noot:org.nooterra:labs-1",
  "orgDid": "did:noot:org.nooterra",
  "registryUrl": "https://api.nooterra.ai",
  "coordinatorUrl": "https://coord.nooterra.ai",
  "publicKey": "base64(ed25519_public_key)"
}
```

The node has its own Ed25519 keypair used to sign snapshots and node‑to‑node messages.

### 1.2 Local vs Remote Agents

From the perspective of a node:

- **Local agent** – registered directly with this node’s registry.
- **Remote agent** – registered with a different node, learned via snapshot ingestion.

Nodes may choose to act only on **local agents**, or to accept **remote agents** according to trust policy.

## 2. Node Card

Nodes themselves have a “Node Card” similar to an agent ACARD:

```json
{
  "nodeId": "nootnode:did:noot:org.nooterra:labs-1",
  "orgDid": "did:noot:org.nooterra",
  "registryUrl": "https://api.nooterra.ai",
  "coordinatorUrl": "https://coord.nooterra.ai",
  "publicKey": "base64(ed25519_public_key)",
  "metadata": {
    "version": 1,
    "created_at": "2025-11-29T20:00:00Z",
    "updated_at": "2025-11-29T20:00:00Z",
    "tags": ["lab", "logistics", "testnet"]
  }
}
```

Signed as `nodeCardSignature = sign(serializedNodeCard, nodeSecretKey)`.

Exposed via:

```text
GET /v1/node/card
```

Peers use this to authenticate snapshots from that node.

## 3. Registry Snapshots

### 3.1 Snapshot Payload

Each node exposes a snapshot of its local registry for federation:

```text
GET /v1/node/snapshot
```

Returns:

```json
{
  "nodeCard": {
    "nodeId": "nootnode:did:noot:org.nooterra:labs-1",
    "orgDid": "did:noot:org.nooterra",
    "registryUrl": "https://api.nooterra.ai",
    "coordinatorUrl": "https://coord.nooterra.ai",
    "publicKey": "base64(node_public_key)",
    "metadata": { "version": 1, "tags": ["lab", "logistics"] }
  },
  "agents": [
    {
      "did": "did:noot:logistics.customs.eu1",
      "orgDid": "did:noot:org.someforwarder",
      "nodeId": "nootnode:did:noot:org.nooterra:labs-1",
      "capabilities": [
        "cap.customs.classify.v1"
      ],
      "reputation": 0.87,
      "last_seen": "2025-11-29T20:00:00Z",
      "region": "EU",
      "risk_level": "high"
    }
  ],
  "timestamp": "2025-11-29T20:00:00Z",
  "snapshotId": "sha256-of-body",
  "signature": "base64(ed25519_signature_over_body)"
}
```

- `agents` is summarized metadata; full ACARDs can be pulled on demand if needed.
- `signature` is computed over the JSON (excluding the `signature` field itself).
- A snapshot only covers **local agents**; remote agents learned from others are not re‑exported by default (to avoid exponential gossip), unless a node explicitly acts as a relay.

### 3.2 Snapshot Semantics

- A snapshot is point‑in‑time; nodes SHOULD publish at fixed intervals (e.g., every 60 seconds) and/or on significant changes.
- Each snapshot SHOULD include:
  - All active, non‑revoked agents.
  - Current aggregate reputation.
  - Last heartbeat time.

## 4. Snapshot Ingestion

Each node maintains a **peer configuration**:

```json
{
  "peers": [
    {
      "nodeId": "nootnode:did:noot:org.partner:prod-1",
      "registryUrl": "https://api.partner-noot.com",
      "allowed": true,
      "maxAgents": 10000,
      "allowedCapabilities": ["cap.customs.*", "cap.weather.*"],
      "blockedCapabilities": [],
      "minReputation": 0.3
    }
  ]
}
```

### 4.1 Pull Model

Node periodically pulls snapshots:

- For each peer with `allowed=true`:
  1. `GET peer.registryUrl/v1/node/snapshot`.
  2. Verify signature:
     - Fetch `nodeCard.publicKey`.
     - Verify Ed25519 signature over snapshot body (minus `signature`).
  3. If verification fails, ignore snapshot and optionally mark peer as untrusted.

### 4.2 Ingestion Rules

For each agent in `snapshot.agents`:

- Apply peer‑level filters:
  - If `maxAgents` exceeded → skip extra entries.
  - If capability set excludes this agent’s caps → skip.
  - If agent `reputation < minReputation` → skip.

- Ingest into `remote_agents` table:

```text
remote_agents(
  did,
  org_did,
  home_node_id,
  endpoint,
  capabilities[],
  reputation,
  region,
  risk_level,
  last_seen,
  snapshot_id,
  ingested_at,
  status
)
```

- Update:
  - If a row exists for `(did, home_node_id)` → update fields, keep a small history if desired.
  - Else → insert with `status='active'`.

- Revocation:
  - If a local registry later revokes an agent, future snapshots MUST omit or flag that agent (e.g., `status='revoked'`).
  - Remote ingestors SHOULD mark remote agent as `revoked` and stop routing workflows to it.

## 5. Local vs Remote Usage

### 5.1 Selection Sources

When selecting an agent for a capability, a coordinator MAY:

- Use **local only** agents (current default).
- Use **local + remote** agents that meet policy:

```sql
-- local
select did, endpoint, reputation
from agents a
join capabilities c on c.agent_did = a.did
where c.capability_id = $1
  and not a.revoked;

-- remote
select did, endpoint, reputation
from remote_agents
where capabilities @> ARRAY[$1]
  and status = 'active';
```

Node‑level policy decides:

- Whether to include remote agents at all.
- Which remote nodes/orgs/capabilities are allowed.

### 5.2 Trust Levels

Introduce `trust_level` for each remote agent:

- `trusted` – from whitelisted node/org and meets all policy constraints.
- `untrusted` – known but not allowed for routing (e.g., below rep threshold).
- `revoked` – explicitly revoked.

Selection SHOULD consider only `trusted` remote agents.

## 6. Security & Governance

### 6.1 Security Considerations

- Always verify snapshot signatures using `nodeCard.publicKey`.
- Limit snapshot size and number of agents ingested per peer.
- Rate‑limit snapshot fetches.
- Support modes:
  - **local‑only** (no federation).
  - **read‑only federation** (only ingest, never export).

### 6.2 Governance Hooks

Per node:

- Config:
  - `blockedOrgDids[]`, `blockedAgentDids[]`, `blockedCapabilities[]`.
  - `allowedNodes[]`, `blockedNodes[]`.
- Admin APIs:
  - `POST /v1/admin/node/peer` – add/update peer config.
  - `POST /v1/admin/remote/agent/block` – explicitly block a remote agent.

## 7. Incremental Implementation Plan

1. **Node Card**
   - Add node card JSON and `GET /v1/node/card` on registry.
   - Generate node keypair, store secret key in node env.
2. **Snapshot Endpoint**
   - Implement `GET /v1/node/snapshot` on registry using local tables.
   - Sign snapshots with node secret key.
3. **Ingestion**
   - Add `remote_agents` table on coordinator.
   - Implement ingestion job that reads a static `peers.json`, pulls snapshots, verifies signatures, and upserts `remote_agents`.
4. **Selection**
   - Extend agent selection queries to optionally include `remote_agents` based on node policy.
5. **Console**
   - Add a “Nodes” view listing peers and remote agent counts.
   - Annotate agents with `home_node_id` when remote.

