import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const webhookSecret = process.env.WEBHOOK_SECRET || "";
const agentDid = process.env.DID || "did:noot:example:planner-hermes";
const port = Number(process.env.PORT || 4300);

const coordUrl = process.env.RAILWAY_ENVIRONMENT
  ? process.env.INTERNAL_COORD_URL || "http://nooterra-coordinator.railway.internal:3002"
  : process.env.COORD_URL || "https://coord.nooterra.ai";
const registryUrl = process.env.REGISTRY_URL || "https://api.nooterra.ai";

// Hermes (UncloseAI) OpenAI-compatible endpoint
const hermesClient = new OpenAI({
  baseURL: process.env.HERMES_BASE_URL || "https://hermes.ai.unturf.com/v1",
  apiKey: process.env.HERMES_API_KEY || "dummy-api-key",
});
const HERMES_MODEL =
  process.env.HERMES_MODEL ||
  "adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic";

const systemPrompt = [
  "You are a workflow planning agent for the Nooterra protocol.",
  "You will be given:",
  "- a high-level intent and description,",
  "- an optional max budget in NCR cents,",
  "- a list of available capabilities (capabilityId, description, price_cents).",
  "",
  "Your job: propose a workflow DAG (1-8 nodes).",
  "",
  "Rules:",
  "- Use ONLY the provided capabilityId values.",
  "- Each node must have:",
  '    name (string, unique),',
  '    capabilityId (string),',
  '    dependsOn (array of node names; may be empty),',
  "    payload (optional object).",
  "- Graph must be acyclic.",
  "- Output STRICT JSON only, no commentary:",
  '{',
  '  "intent": "string",',
  '  "maxCents": number | null,',
  '  "nodes": {',
  '    "node_name": {',
  '      "capabilityId": "cap.something.v1",',
  '      "dependsOn": ["other_node"],',
  '      "payload": { /* optional */ }',
  '    }',
  '  }',
  '}',
].join("\n");

const agentConfig = defineAgent({
  did: agentDid,
  coordinatorUrl: coordUrl,
  registryUrl,
  endpoint: process.env.AGENT_ENDPOINT || "https://agent-planner-hermes.up.railway.app",
  webhookSecret,
  port,
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  capabilities: [
    {
      id: "cap.plan.workflow.v1",
      description: "LLM-driven workflow planner using Hermes (UncloseAI)",
      priceCredits: process.env.PLANNER_PRICE_CREDITS
        ? Number(process.env.PLANNER_PRICE_CREDITS)
        : undefined,
      handler: async ({ inputs }) => {
        const intent = (inputs?.intent || "").toString();
        const description = (inputs?.description || "").toString();
        const maxCents =
          typeof inputs?.maxCents === "number" ? inputs.maxCents : null;
        const capabilities = Array.isArray(inputs?.capabilities)
          ? inputs.capabilities
          : [];

        const started = Date.now();
        try {
          const resp = await hermesClient.chat.completions.create({
            model: HERMES_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: JSON.stringify({
                  intent,
                  description,
                  maxCents,
                  capabilities,
                }),
              },
            ],
            temperature: 0.2,
            max_tokens: 768,
          });

          const latency = Date.now() - started;
          const content =
            resp.choices?.[0]?.message?.content ??
            resp.choices?.[0]?.message ??
            "";
          let parsed = null;
          try {
            parsed = typeof content === "string" ? JSON.parse(content) : null;
          } catch {
            parsed = null;
          }
          const nodes =
            parsed && parsed.nodes && typeof parsed.nodes === "object"
              ? parsed.nodes
              : {};
          return {
            result: {
              intent: parsed?.intent || intent || "suggested",
              maxCents:
                typeof parsed?.maxCents === "number"
                  ? parsed.maxCents
                  : maxCents,
              nodes,
            },
            metrics: { latency_ms: latency },
          };
        } catch (err) {
          const latency = Date.now() - started;
          console.error("[planner-hermes] error", err);
          return {
            result: { error: err?.message || "Planner failed" },
            metrics: { latency_ms: latency },
          };
        }
      },
    },
  ],
});

startAgentServer(agentConfig).then(() => {
  console.log(
    `Planner (Hermes) agent listening on ${agentConfig.port} as ${agentConfig.did}`
  );
  console.log(`Endpoint (base): ${agentConfig.endpoint}`);
});
