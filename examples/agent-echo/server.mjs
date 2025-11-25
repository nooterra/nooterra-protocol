import { listen } from "@nooterra/core/dist/agent.js";

const coordUrl = process.env.COORD_URL || "https://coord.nooterra.ai";
const apiKey = process.env.API_KEY || "";
const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:echo-demo";
const port = Number(process.env.PORT || 4000);

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
    console.log("Echo agent received inputs:", inputs);
    return { result: { echo: inputs }, metrics: { latency_ms: 200 } };
  },
}).then(() => {
  console.log(`Echo agent listening on ${port} as ${agentDid}`);
  console.log("Remember to expose this port (e.g., ngrok http 4000) and register the endpoint.");
});
