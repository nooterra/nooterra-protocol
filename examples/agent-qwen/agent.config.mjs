import { defineAgent } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:qwen-coder";
const port = Number(process.env.PORT || 4300);

const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";
const registryUrl = process.env.REGISTRY_URL || "https://api.nooterra.ai";

export default defineAgent({
  did: agentDid,
  coordinatorUrl: coordUrl,
  registryUrl,
  endpoint:
    process.env.AGENT_ENDPOINT ||
    "https://agent-qwen-production.up.railway.app",
  webhookSecret,
  port,
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.llm.qwen.coder.v1",
      description:
        "Coding-focused chat completion using Qwen 3 Coder (free, OpenAI-compatible via uncloseai)",
      priceCredits: process.env.QWEN_PRICE_CREDITS
        ? Number(process.env.QWEN_PRICE_CREDITS)
        : undefined,
      handler: "qwenHandler", // defined in server.mjs
    },
  ],
});
