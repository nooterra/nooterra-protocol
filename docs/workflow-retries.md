# DAG Hardening: Retries, Deadlines, Cancellation (Draft)

## Node-Level Retry Policy
- Retry on 5xx or timeout.
- Backoff with jitter: e.g., base 500ms, factor 2, max 30s.
- Max attempts per node: configurable (default 3).
- If no candidate agents available → mark skipped/failed per policy.

## Deadlines
- Each node may specify `deadline_ms` or inherit from workflow default.
- Dispatcher must not dispatch if deadline exceeded.
- Coordinator marks node failed (deadline_exceeded) and propagates to dependents.

## Cancellation
- If workflow is canceled, all pending nodes transition to `canceled`.
- In-flight nodes complete or are terminated per policy (graceful/cancel).

## Partial Failure Strategies
- Skip: ignore failed parents, continue if optional.
- Abort: stop workflow on first failure.
- Retry: attempt new agent selection for failed node until max attempts.

## Suggested Implementation Hooks
- Add columns to task_nodes: `deadline_at`, `failure_reason`.
- Track attempts and last_error per node.
- Dispatcher respects `next_attempt` time with jitter.
- Coordinator exposes cancel endpoint to mark workflow canceled.
