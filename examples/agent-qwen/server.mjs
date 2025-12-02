import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import OpenAI from "openai";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:qwen-coder";
const port = Number(process.env.PORT || 4300);

// Coordinator / registry URLs
const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";
const registryUrl = process.env.REGISTRY_URL || "https://api.nooterra.ai";

// UncloseAI Qwen 3 Coder: OpenAI-compatible API
const qwenClient = new OpenAI({
  baseURL: process.env.QWEN_BASE_URL || "https://qwen.ai.unturf.com/v1",
  apiKey: process.env.QWEN_API_KEY || "dummy-api-key",
});

const QWEN_MODEL =
  process.env.QWEN_MODEL ||
  "hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:Q4_K_M";

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl,
  coordinatorUrl: coordUrl,
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
      // Free by default in Labs; set QWEN_PRICE_CREDITS to charge
      priceCredits: process.env.QWEN_PRICE_CREDITS
        ? Number(process.env.QWEN_PRICE_CREDITS)
        : undefined,
      handler: async ({ inputs }) => {
        const { prompt, messages, temperature, max_tokens, parents } = inputs || {};

        const finalMessages =
          messages && Array.isArray(messages) && messages.length > 0
            ? messages
            : [
                {
                  role: "user",
                  content:
                    typeof prompt === "string" && prompt.length
                      ? prompt
                      : "You are a helpful coding assistant. If context is provided, use it.",
                },
              ];

        // If parents exist, append a context message so the model can use upstream outputs
        if (parents && typeof parents === "object") {
          try {
            const pretty = JSON.stringify(parents, null, 2);
            finalMessages.push({
              role: "system",
              content: `Context from previous nodes:\n${pretty}`,
            });
          } catch {
            // ignore JSON errors
          }
        }

        const started = Date.now();

        try {
          const response = await qwenClient.chat.completions.create({
            model: QWEN_MODEL,
            messages: finalMessages,
            temperature:
              typeof temperature === "number" ? temperature : 0.3,
            max_tokens:
              typeof max_tokens === "number" ? max_tokens : 256,
          });

          const latency = Date.now() - started;
          const choice = response.choices?.[0];
          const content = choice?.message?.content ?? "";

          return {
            result: {
              ok: true,
              model: QWEN_MODEL,
              content,
              raw: response,
            },
            metrics: {
              latency_ms: latency,
            },
          };
        } catch (err) {
          const latency = Date.now() - started;
          console.error("[qwen-agent] error", err);
          return {
            result: {
              ok: false,
              error: err?.message || "Qwen call failed",
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
    `Qwen coder agent listening on ${agentConfig.port} as ${agentConfig.did}`,
  );
  console.log(`Endpoint (base): ${agentConfig.endpoint}`);
});
