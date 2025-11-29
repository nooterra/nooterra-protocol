import { defineAgent } from "@nooterra/agent-sdk";

export default defineAgent({
  did: process.env.DID || "did:noot:langgraph.demo",
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: process.env.COORD_URL || "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "http://localhost:3100",
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  publicKey: process.env.PUBLIC_KEY || "",
  privateKey: process.env.PRIVATE_KEY || "",
  port: Number(process.env.PORT || 3100),
  capabilities: [
    {
      id: "cap.demo.langgraph.v1",
      description: "Example LangGraph-backed capability (stub)",
      handler: async ({ inputs, parents, meta }) => {
        // In a real integration, you would call your LangGraph here:
        // const res = await graph.invoke({ inputs, parents, meta });
        const res = {
          ok: true,
          kind: "langgraph-demo",
          echo: inputs,
          parents,
          meta,
        };
        return { result: res, metrics: { latency_ms: 250 } };
      },
    },
  ],
});

