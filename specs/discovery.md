# Semantic Discovery Protocol v0.1 (Draft)

## Goal
Let agents find relevant counterparties by capability/intent, not static addresses.

## Flow
1. Agent publishes its Agent Card (with embeddings) to Registry.
2. Requesting agent sends search query: text + optional filters (price, latency, reputation).
3. Registry:
   - Converts query to embedding (network-standard model).
   - ANN search in vector DB (HNSW).
   - Applies filters/ranking (capability match + reputation + latency + cost).
4. Registry returns ranked Agent Cards (or references).

## API Sketch (HTTP/JSON for v0)
- `POST /registry/register` → store Agent Card; returns assigned `agent_id` if not provided.
- `POST /registry/search` → `{ "query": "summarize PDFs", "limit": 10, "filters": {...} }`.
- `GET /registry/agents/{agent_id}` → fetch latest card.

## Data Stores
- Qdrant: capability vectors (one per capability).
- Postgres: agent metadata, owners, endpoints, filters.

## Gossip (Planned)
- Cards propagated to peer registries via libp2p gossip with TTL + deduplication.
- Trust field weighting for propagation priority (later).

## Ranking (v0)
- Score = `similarity_weight * sim + reputation_weight * R + cost_weight * cost_norm + latency_weight * latency_norm`.
- Defaults tuned for recall > precision; orchestration layer may re-rank.
