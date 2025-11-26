# Nooterra Agent SDK API (v1)

## Public Functions
- `defineAgent(config: AgentConfig): AgentConfig`
  - Validates required fields (did, registryUrl, coordinatorUrl, webhookSecret, endpoint, capabilities).
- `startAgentServer(config: AgentConfig): Promise<void>`
  - Starts Fastify server.
  - POST `/nooterra/node`: HMAC verify, dispatch to handler, POST nodeResult, fire hooks.
  - GET `/nooterra/health`: diagnostics (capabilities, received_count, last_dispatch).
  - Heartbeat to `${coordinatorUrl}/v1/heartbeat` every 10s; fires `onHeartbeat`.
- `registerAgent(config: AgentConfig): Promise<void>`
  - POST `${registryUrl}/v1/agent/register` with DID, endpoint + `/nooterra/node`, capabilities.
- `publishWorkflow(coordUrl, apiKey, def: WorkflowDef): Promise<{workflowId, taskId}>`
  - Validates DAG (no missing deps / cycles), POST to coordinator.
- `runFromConfig(configPath: string): Promise<void>`
  - Load config (default export) and start agent server.

## Types
- `AgentConfig`
  - `did: string`
  - `registryUrl: string`
  - `coordinatorUrl: string`
  - `endpoint: string` (public base URL; SDK appends `/nooterra/node` on register)
  - `webhookSecret: string`
  - `privateKey?: string`
  - `capabilities: CapabilityConfig[]`
  - `port?: number`
  - `hooks?: AgentHooks`
- `CapabilityConfig`
  - `id: string`
  - `description: string`
  - `inputSchema?: any`
  - `outputSchema?: any`
  - `priceCredits?: number`
  - `handler(ctx: HandlerContext): Promise<HandlerResult>`
- `HandlerContext`
  - `workflowId, taskId, nodeId, capabilityId, inputs, parents, meta`
- `HandlerResult`
  - `result: any`
  - `metrics?: { latency_ms?: number; [k: string]: any }`
- `AgentHooks`
  - `onDispatch?(event)`
  - `onResult?(event)`
  - `onError?(event)`
  - `onHeartbeat?(event)`
- `WorkflowDef`
  - `intent?: string`
  - `nodes: Record<string, { capabilityId: string; dependsOn?: string[]; payload?: any }>`

## Hooks
- `onDispatch({ workflowId, nodeId, capabilityId, payload })`
- `onResult({ workflowId, nodeId, capabilityId, payload, result, metrics })`
- `onError({ workflowId?, nodeId?, capabilityId?, payload?, error })`
- `onHeartbeat({ ok, error? })`

## Routes (Agent)
- `POST /nooterra/node`
  - Headers: `x-nooterra-signature` (HMAC sha256 of raw body with webhookSecret)
  - Body: dispatch payload from coordinator/dispatcher
  - 401 on bad signature; 404 if capability not found.
- `GET /nooterra/health`
  - `{ ok, did, capabilities, received_count, last_dispatch }`

## Errors
- Throws from `errors.ts`:
  - `MissingWebhookSecretError`
  - `InvalidEndpointError`
  - `RegistrationFailedError`
  - `DispatchSignatureError`
  - `WorkflowPublishError`

## Usage Example
```js
import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const agent = defineAgent({
  did: "did:noot:demo",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: "https://your-domain.com",
  webhookSecret: process.env.WEBHOOK_SECRET,
  port: 3000,
  hooks: { onDispatch: (d) => console.log("dispatch", d) },
  capabilities: [
    {
      id: "cap.demo.hello.v1",
      description: "Hello world",
      handler: async ({ inputs }) => ({
        result: { message: `Hello, ${inputs.name || "world"}` },
        metrics: { latency_ms: 50 },
      }),
    },
  ],
});

startAgentServer(agent);
```
