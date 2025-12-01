import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import OpenAI from "openai";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:hermes";
const port = Number(process.env.PORT || 4200);

// Coordinator / registry URLs
const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";

const registryUrl = process.env.REGISTRY_URL || "https://api.nooterra.ai";

// UncloseAI Hermes: OpenAI-compatible API
// Docs: https://uncloseai.com/nodejs-examples.html
const hermesClient = new OpenAI({
  baseURL: process.env.HERMES_BASE_URL || "https://hermes.ai.unturf.com/v1",
  apiKey: process.env.HERMES_API_KEY || "dummy-api-key",
});

const HERMES_MODEL =
  process.env.HERMES_MODEL || "adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic";

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl,
  coordinatorUrl: coordUrl,
  endpoint:
    process.env.AGENT_ENDPOINT ||
    "https://agent-hermes-production.up.railway.app",
  webhookSecret,
  port,
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.llm.hermes.chat.v1",
      description:
        "General-purpose chat completion using Hermes (free, OpenAI-compatible LLM via uncloseai)",
      // Free by default in Labs; set HERMES_PRICE_CREDITS if you want to charge
      priceCredits: process.env.HERMES_PRICE_CREDITS
        ? Number(process.env.HERMES_PRICE_CREDITS)
        : undefined,
      handler: async ({ inputs }) => {
        const { prompt, messages, temperature, max_tokens } = inputs || {};

        const finalMessages =
          messages && Array.isArray(messages) && messages.length > 0
            ? messages
            : [
                {
                  role: "user",
                  content:
                    typeof prompt === "string"
                      ? prompt
                      : "You are a helpful AI assistant.",
                },
              ];

        const started = Date.now();

        try {
          const response = await hermesClient.chat.completions.create({
            model: HERMES_MODEL,
            messages: finalMessages,
            temperature:
              typeof temperature === "number" ? temperature : 0.5,
            max_tokens:
              typeof max_tokens === "number" ? max_tokens : 256,
          });

          const latency = Date.now() - started;
          const choice = response.choices?.[0];
          const content = choice?.message?.content ?? "";

          return {
            result: {
              ok: true,
              model: HERMES_MODEL,
              content,
              raw: response,
            },
            metrics: {
              latency_ms: latency,
            },
          };
        } catch (err) {
          const latency = Date.now() - started;
          console.error("[hermes-agent] error", err);
          return {
            result: {
              ok: false,
              error: err?.message || "Hermes call failed",
            },
            metrics: {
              latency_ms: latency,
            },
          };
        }
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(
    `Hermes agent listening on ${agentConfig.port} as ${agentConfig.did}`,
  );
  console.log(`Endpoint (base): ${agentConfig.endpoint}`);
});
