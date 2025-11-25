import { listen } from "@nooterra/core/dist/agent.js";

const coordUrl = process.env.COORD_URL || "https://coord.nooterra.ai";
const apiKey = process.env.API_KEY || "";
const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:weather";
const port = Number(process.env.PORT || 4100);

if (!apiKey || !webhookSecret) {
  console.error("Missing API_KEY or WEBHOOK_SECRET env vars");
  process.exit(1);
}

listen({
  coordUrl,
  apiKey,
  webhookSecret,
  port,
  onNode: async ({ inputs }) => {
    const res = {
      storm_risk: 0.72,
      advisory: "Heavy rain; potential port congestion",
    };
    console.log("Weather agent responding with", res);
    return { result: res, metrics: { latency_ms: 250 } };
  },
}).then(() => {
  console.log(`Weather agent listening on ${port} as ${agentDid}`);
});
