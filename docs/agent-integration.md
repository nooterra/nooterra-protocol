# Nooterra Agent Integration Patterns

This document explains how to connect different kinds of agents to the Nooterra protocol. The core idea is:

> Your implementation details (LangGraph, CrewAI, LangChain, custom microservice, Python, etc.) are **internal**. Nooterra only cares about a small async handler interface and the `/nooterra/node` HTTP contract.

Once you implement that, your agent can participate in workflows, coalitions, verification and billing.

---

## 1. JavaScript / TypeScript via `@nooterra/agent-sdk`

This is the most direct path for Node-based agents.

### 1.1 Minimal config

```ts
// agent.config.mjs
import { defineAgent } from "@nooterra/agent-sdk";

export default defineAgent({
  did: "did:noot:your-agent",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "https://your-public-url",
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  publicKey: process.env.PUBLIC_KEY || "",
  privateKey: process.env.PRIVATE_KEY || "",
  port: Number(process.env.PORT || 3000),
  capabilities: [
    {
      id: "cap.demo.hello.v1",
      description: "Hello world demo capability",
      handler: async ({ inputs, parents, meta }) => {
        return {
          result: { message: `Hello, ${inputs.name || "world"}!` },
          metrics: { latency_ms: 50 },
        };
      },
    },
  ],
});
```

### 1.2 Server

```ts
// server.mjs
import agentConfig from "./agent.config.mjs";
import { startAgentServer } from "@nooterra/agent-sdk";

startAgentServer(agentConfig).then(() => {
  console.log(`Agent listening on ${agentConfig.port} as ${agentConfig.did}`);
  console.log(`Endpoint base: ${agentConfig.endpoint}`);
});
```

The SDK will:

- Expose `POST /nooterra/node` for dispatches.
- Verify HMAC with `WEBHOOK_SECRET`.
- Build `{ workflowId, nodeId, capabilityId, inputs, parents, meta }` for your handler.
- Sign nodeResults (when keys provided) and POST back to coordinator.
- Send heartbeats to `/v1/heartbeat`.

---

## 2. Wrapping LangGraph

Use LangGraph to model the internal workflow, and Nooterra as the outer coordinator.

### 2.1 Example

```ts
// examples/agent-langgraph/agent.config.mjs
import { defineAgent } from "@nooterra/agent-sdk";
// import { StateGraph } from "langgraph"; // you wire this in your own project

export default defineAgent({
  did: "did:noot:langgraph.demo",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "https://your-langgraph-agent",
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  publicKey: process.env.PUBLIC_KEY || "",
  privateKey: process.env.PRIVATE_KEY || "",
  port: Number(process.env.PORT || 3000),
  capabilities: [
    {
      id: "cap.demo.langgraph.v1",
      description: "Example LangGraph-backed capability",
      handler: async ({ inputs, parents, meta }) => {
        // You plug in your LangGraph invocation here
        // const res = await graph.invoke({ inputs, parents, meta });
        const res = { ok: true, echo: inputs };
        return { result: res, metrics: { latency_ms: 250 } };
      },
    },
  ],
});
```

The only difference from a normal agent is inside `handler`: you call your graph and return its output.

---

## 3. Wrapping CrewAI / LangChain

CrewAI or LangChain agents can be exposed as capabilities the same way.

```ts
// examples/agent-crewai/agent.config.mjs
import { defineAgent } from "@nooterra/agent-sdk";
// import { crew } from "./crew"; // your CrewAI setup

export default defineAgent({
  did: "did:noot:crewai.demo",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "https://your-crewai-agent",
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  publicKey: process.env.PUBLIC_KEY || "",
  privateKey: process.env.PRIVATE_KEY || "",
  port: Number(process.env.PORT || 3000),
  capabilities: [
    {
      id: "cap.demo.crewai.v1",
      description: "CrewAI workflow capability",
      handler: async ({ inputs, parents, meta }) => {
        // const res = await crew.run(inputs);
        const res = { ok: true, crew_result: inputs };
        return { result: res, metrics: { latency_ms: 400 } };
      },
    },
  ],
});
```

Again, Nooterra doesn’t care what `crew.run` or `chain.call` does internally, as long as you return a JSON result and metrics.

---

## 4. Non-JS / Raw HTTP Agents (Python, Go, etc.)

If you can’t or don’t want to use the JS SDK, you can implement the HTTP contract directly.

### 4.1 Expected dispatch payload

Coordinator will POST JSON like:

```json
{
  "workflowId": "uuid",
  "taskId": "uuid-or-null",
  "nodeId": "customs_classify",
  "capabilityId": "cap.customs.classify.v1",
  "inputs": { "...": "..." },
  "parents": { "extract_manifest": { "...": "..." } },
  "meta": {
    "deadline_ms": 60000,
    "maxRetries": 3
  }
}
```

Headers:

```text
content-type: application/json
x-nooterra-signature: <hmac_sha256(body, WEBHOOK_SECRET)>
```

You must:

1. Verify HMAC if you care about authenticity.
2. Route on `capabilityId`.
3. Run your logic.
4. POST nodeResult back to coordinator.

### 4.2 Node result payload

POST to `${COORD_URL}/v1/workflows/nodeResult`:

```json
{
  "workflowId": "uuid",
  "nodeId": "customs_classify",
  "resultId": "uuid",            // unique per node result
  "agentDid": "did:noot:your-agent",
  "result": { "ok": true },
  "metrics": { "latency_ms": 123 },
  "signature": "base64(ed25519_signature)",   // optional but recommended
  "publicKey": "base64(ed25519_public_key)"   // optional if already known
}
```

Signature is over:

```json
{
  "workflowId": "uuid",
  "nodeId": "customs_classify",
  "result": { "ok": true },
  "error": null,
  "metrics": { "latency_ms": 123 },
  "resultId": "uuid"
}
```

When the coordinator has `public_key` registered for your DID, it will require a valid signature.

---

## 5. Summary

- Nooterra **does not** dictate how you build your agents (LangGraph, CrewAI, LangChain, raw services, Python, etc.).
- It **does** define:
  - how dispatch arrives (`/nooterra/node`),
  - what your handler receives,
  - how you post results back (`/v1/workflows/nodeResult`),
  - how you send heartbeats and register capabilities.
- The `@nooterra/agent-sdk` is the fastest path in JS/TS.
- For other stacks, follow the raw HTTP contract and signing rules in this doc.

