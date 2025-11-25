import { listen } from "@nooterra/core/dist/agent.js";

const coordUrl = process.env.COORD_URL || "https://coord.nooterra.ai";
const apiKey = process.env.API_KEY || "";
const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:rail";
const port = Number(process.env.PORT || 4102);

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
}).then(() => {
  console.log(`Rail agent listening on ${port} as ${agentDid}`);
});
