import { defineAgent } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:github";
const port = Number(process.env.PORT || 4500);

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
    "https://agent-github-production.up.railway.app",
  webhookSecret,
  port,
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.github.create_issue.v1",
      description:
        "Create a GitHub issue given repo, title, body, and optional labels",
      priceCredits: process.env.GITHUB_ISSUE_PRICE_CREDITS
        ? Number(process.env.GITHUB_ISSUE_PRICE_CREDITS)
        : undefined,
      handler: "createIssueHandler"
    }
  ]
});

