import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:rail";
const port = Number(process.env.PORT || 4102);

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: process.env.COORD_URL || "https://coord.nooterra.ai",
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-rail-production.up.railway.app",
  webhookSecret,
  port,
  capabilities: [
    {
      id: "cap.rail.optimize.v1",
      description: "Rail optimization stub",
      handler: async () => {
        const res = {
          options: [
            { id: "route-west-1", eta_hours: 28, congestion_score: 0.3, cost_usd: 8000 },
            { id: "route-south-2", eta_hours: 32, congestion_score: 0.15, cost_usd: 7600 },
          ],
          recommended: "route-west-1",
          reason: "Storm risk at port; lower congestion inland",
        };
        console.log("Rail agent responding with", res);
        return { result: res, metrics: { latency_ms: 350 } };
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(`Rail agent listening on ${port} as ${agentDid}`);
});
