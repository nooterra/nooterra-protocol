import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import OpenAI from "openai";

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:tts";
const port = Number(process.env.PORT || 4400);

// Coordinator / registry URLs
const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";
const registryUrl = process.env.REGISTRY_URL || "https://api.nooterra.ai";

// UncloseAI TTS: OpenAI-compatible speech API
const ttsClient = new OpenAI({
  baseURL: process.env.TTS_BASE_URL || "https://speech.ai.unturf.com/v1",
  apiKey: process.env.TTS_API_KEY || "YOLO",
});

const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";

const agentConfig = defineAgent({
  did: agentDid,
  registryUrl,
  coordinatorUrl: coordUrl,
  endpoint:
    process.env.AGENT_ENDPOINT ||
    "https://agent-tts-production.up.railway.app",
  webhookSecret,
  port,
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.tts.unclose.v1",
      description:
        "Generate speech audio from text using uncloseai TTS (OpenAI-compatible)",
      // Free in Labs; set TTS_PRICE_CREDITS to charge
      priceCredits: process.env.TTS_PRICE_CREDITS
        ? Number(process.env.TTS_PRICE_CREDITS)
        : undefined,
      handler: async ({ inputs }) => {
        const { text, voice, format, parents, textFromParentField } = inputs || {};

        // Resolve the text to speak:
        // 1) If explicit `text` is provided, use it.
        // 2) Else, if `textFromParentField` is provided, try to pluck that field
        //    from `parents` (e.g. "hermes_summary.content").
        // 3) Else, if there is a single parent with a `content` field, use that.
        // 4) Fallback: generic greeting.

        let promptText;

        if (typeof text === "string" && text.length) {
          promptText = text;
        } else if (parents && typeof textFromParentField === "string" && textFromParentField.length) {
          try {
            const [parentKey, ...path] = textFromParentField.split(".");
            const parent = parents[parentKey];
            let value = parent;
            for (const segment of path) {
              if (value && typeof value === "object") {
                value = value[segment];
              } else {
                value = undefined;
                break;
              }
            }
            if (typeof value === "string" && value.length) {
              promptText = value;
            }
          } catch {
            // ignore and fall through
          }
        } else if (parents && typeof parents === "object") {
          const parentValues = Object.values(parents);
          const contentStrings = parentValues
            .map((p) => (p && typeof p === "object" ? p.content : undefined))
            .filter((v) => typeof v === "string" && v.length);
          if (contentStrings.length === 1) {
            promptText = contentStrings[0];
          }
        }

        if (!promptText) {
          promptText = "Hello from the Nooterra TTS agent.";
        }

        const started = Date.now();

        try {
          // We request base64 audio to keep the payload JSON-friendly
          const response = await ttsClient.audio.speech.create({
            model: TTS_MODEL,
            voice: typeof voice === "string" ? voice : "alloy",
            input: promptText,
            format: typeof format === "string" ? format : "mp3",
            response_format: "b64_json",
          });

          const latency = Date.now() - started;
          const b64 = response?.b64_json || null;

          return {
            result: {
              ok: true,
              model: TTS_MODEL,
              text: promptText,
              audio_base64: b64,
              format: format || "mp3",
            },
            metrics: {
              latency_ms: latency,
            },
          };
        } catch (err) {
          const latency = Date.now() - started;
          console.error("[tts-agent] error", err);
          return {
            result: {
              ok: false,
              error: err?.message || "TTS call failed",
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
  console.log(`TTS agent listening on ${agentConfig.port} as ${agentConfig.did}`);
  console.log(`Endpoint (base): ${agentConfig.endpoint}`);
});
