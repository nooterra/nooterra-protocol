import { listen } from "@nooterra/core/dist/agent.js";

const coordUrl = process.env.COORD_URL || "https://coord.nooterra.ai";
const apiKey = process.env.API_KEY || "";
const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:customs";
const port = Number(process.env.PORT || 4101);

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
      total_declared_value: 180000,
      estimated_duties_usd: 9000,
      high_risk_goods: [],
      clearance_time_hours: 5.5,
    };
    console.log("Customs agent responding with", res);
    return { result: res, metrics: { latency_ms: 300 } };
  },
}).then(() => {
  console.log(`Customs agent listening on ${port} as ${agentDid}`);
});
