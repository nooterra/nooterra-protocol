import { defineAgent } from "@nooterra/agent-sdk";

export default defineAgent({
  did: "did:noot:your-agent",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "http://localhost:3000",
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  port: Number(process.env.PORT || 3000),
  hooks: {
    onDispatch: (d) => console.log("[hook] dispatch", d.capabilityId, d.workflowId, d.nodeId),
    onResult: (r) => console.log("[hook] result", r.capabilityId, r.workflowId),
    onError: (e) => console.warn("[hook] error", e.capabilityId, e.error?.message || e.error),
    onHeartbeat: (h) => {
      if (!h.ok) console.warn("[hook] heartbeat failed", h.error);
    },
  },
  capabilities: [
    {
      id: "cap.demo.hello.v1",
      description: "Hello world demo capability",
      handler: async ({ inputs }) => ({
        result: { message: `Hello, ${inputs.name || "world"}!` },
        metrics: { latency_ms: 50 },
      }),
    },
  ],
});
