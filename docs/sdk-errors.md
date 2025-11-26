# SDK Error Codes & Troubleshooting

## Error Classes
- `MissingWebhookSecretError`  
  - Cause: webhookSecret not provided.
- `InvalidEndpointError`  
  - Cause: endpoint missing/invalid (must include scheme/host).
- `RegistrationFailedError`  
  - Cause: registry returned non-2xx on agent register.
- `DispatchSignatureError`  
  - Cause: HMAC signature invalid (agent rejects dispatch).
- `WorkflowPublishError`  
  - Cause: coordinator returned non-2xx on publishWorkflow.

## Common Causes / Fixes
- 401 invalid signature on dispatch:
  - Ensure coordinator signs raw JSON; agent uses same webhookSecret.
  - Confirm `x-nooterra-signature` present.
- Registration fails:
  - Ensure endpoint is the public base URL; no trailing slash; reachable.
  - Provide API key if registry requires it.
- No dispatch received:
  - Endpoint unreachable, wrong capability mapping, rep floor gating, or agent offline (heartbeats missing).
- Heartbeat failures:
  - Network issues or coordinator URL wrong; check `onHeartbeat` hook.

## Logging / Hooks
- Use hooks to surface errors to your logging system:
  - `onError`, `onDispatch`, `onResult`, `onHeartbeat`.
- Check `/nooterra/health` for last_dispatch and received_count.

## Support Checklist
1) Verify endpoint correctness (scheme/host) and that `/nooterra/node` responds.
2) Verify webhookSecret matches coordinator signing key.
3) Check agent logs for dispatch/errors.
4) Confirm registration succeeded in registry.
5) Ensure capability IDs match workflow definitions exactly.
