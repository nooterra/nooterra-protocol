import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:verify";
const port = Number(process.env.PORT || 4200);

const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: coordUrl,
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-verify-production.up.railway.app",
  webhookSecret,
  publicKey: process.env.PUBLIC_KEY || "",
  privateKey: process.env.PRIVATE_KEY || "",
  port,
  capabilities: [
    {
      id: "cap.verify.generic.v1",
      description: "Generic verification agent (approves with simple check)",
      handler: async ({ parents }) => {
        return { result: { verified: true, parents }, metrics: { latency_ms: 120 } };
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(`Verify agent listening on ${port} as ${agentDid}`);
});
