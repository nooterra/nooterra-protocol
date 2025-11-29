import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:weather";
const port = Number(process.env.PORT || 4100);

const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: coordUrl,
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-weather-production.up.railway.app",
  webhookSecret,
  port,
  capabilities: [
    {
      id: "cap.weather.noaa.v1",
      description: "Weather risk stub",
      handler: async ({ inputs }) => {
        const res = {
          storm_risk: 0.72,
          advisory: "Heavy rain; potential port congestion",
        };
        console.log("Weather agent responding with", res);
        return { result: res, metrics: { latency_ms: 250 } };
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(`Weather agent listening on ${port} as ${agentDid}`);
});
