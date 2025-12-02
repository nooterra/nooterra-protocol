import { defineAgent } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:http-adapter";
const port = Number(process.env.PORT || 4400);

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
    "https://agent-http-production.up.railway.app",
  webhookSecret,
  port,
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.http.request.v1",
      description:
        "Generic HTTP adapter: make HTTP requests (method, url, headers, body) on behalf of workflows",
      priceCredits: process.env.HTTP_PRICE_CREDITS
        ? Number(process.env.HTTP_PRICE_CREDITS)
        : undefined,
      handler: "httpRequestHandler"
    }
  ]
});

