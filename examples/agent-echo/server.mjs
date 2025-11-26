import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:echo";
const port = Number(process.env.PORT || 4000);

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: process.env.COORD_URL || "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-echo-production.up.railway.app",
  webhookSecret,
  port,
  capabilities: [
    {
      id: "cap.test.echo",
      description: "Echo stub",
      handler: async ({ inputs }) => {
        console.log("Echo agent received inputs:", inputs);
        return { result: { echo: inputs }, metrics: { latency_ms: 200 } };
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(`Echo agent listening on ${port} as ${agentDid}`);
});
