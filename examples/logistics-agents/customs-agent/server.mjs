import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:customs";
const port = Number(process.env.PORT || 4101);

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: process.env.COORD_URL || "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-customs-production.up.railway.app",
  webhookSecret,
  port,
  capabilities: [
    {
      id: "cap.customs.classify.v1",
      description: "Customs classification stub",
      handler: async () => {
        const res = {
          total_declared_value: 180000,
          estimated_duties_usd: 9000,
          high_risk_goods: [],
          clearance_time_hours: 5.5,
        };
        console.log("Customs agent responding with", res);
        return { result: res, metrics: { latency_ms: 300 } };
      },
    },
    {
      id: "cap.verify.generic.v1",
      description: "Generic verification stub (approves everything)",
      handler: async ({ inputs }) => {
        return { result: { verified: true, original: inputs }, metrics: { latency_ms: 150 } };
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(`Customs agent listening on ${port} as ${agentDid}`);
});
