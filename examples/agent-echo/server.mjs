import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:echo";
const port = Number(process.env.PORT || 4000);

const coordUrl =
  process.env.COORD_URL ||
  process.env.INTERNAL_COORD_URL ||
  (process.env.RAILWAY_ENVIRONMENT ? "http://nooterra-coordinator.railway.internal:3002" : "https://coord.nooterra.ai");

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: coordUrl,
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-echo-production.up.railway.app",
  webhookSecret,
  port,
  // signing keypair for nodeResult (base64-encoded DER private/public)
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.test.echo",
      description: "Echo stub",
      handler: async ({ inputs }) => {
        console.log("Echo agent received inputs:", inputs);
        return { result: { echo: inputs }, metrics: { latency_ms: 200 } };
      },
    },
    {
      id: "cap.verify.generic.v1",
      description: "Generic verification stub (approves everything)",
      handler: async ({ inputs }) => {
        return {
          result: {
            verified: true,
            original: inputs,
          },
          metrics: { latency_ms: 100 },
        };
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(`Echo agent listening on ${port} as ${agentDid}`);
});
