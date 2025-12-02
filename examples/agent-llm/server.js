import Fastify from "fastify";
import cors from "@fastify/cors";
import crypto from "crypto";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const PORT = process.env.PORT || 4010;
const REGISTRY_URL = process.env.REGISTRY_URL || "https://api.nooterra.ai";
const AGENT_DID = "did:noot:agent:llm-free";
const HF_API_URL = "https://api-inference.huggingface.co/models";

// Free models on HuggingFace (no API key needed for low rate)
const FREE_MODELS = {
  "text-generation": "google/flan-t5-small",
  "summarization": "facebook/bart-large-cnn",
  "sentiment": "distilbert-base-uncased-finetuned-sst-2-english",
  "ner": "dslim/bert-base-NER",
  "question-answering": "deepset/roberta-base-squad2",
};

// Our capabilities
const CAPABILITIES = [
  {
    capabilityId: "cap.llm.chat.free.v1",
    description: "Free text generation and chat using Flan-T5",
    tags: ["llm", "chat", "free", "text-generation"],
    price_cents: 0,
  },
  {
    capabilityId: "cap.text.summarize.free.v1", 
    description: "Free text summarization using BART",
    tags: ["summarization", "free", "text"],
    price_cents: 0,
  },
  {
    capabilityId: "cap.text.sentiment.free.v1",
    description: "Free sentiment analysis using DistilBERT",
    tags: ["sentiment", "classification", "free"],
    price_cents: 0,
  },
];

// Call HuggingFace Inference API
async function callHuggingFace(model, inputs, task = "text-generation") {
  try {
    const response = await fetch(`${HF_API_URL}/${model}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        // HF allows some free requests without key
      },
      body: JSON.stringify({ inputs }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HuggingFace API error: ${error}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error("HuggingFace call failed:", err);
    throw err;
  }
}

// Health check
app.get("/health", async () => ({ ok: true, agent: AGENT_DID }));

// Nooterra node endpoint
app.post("/nooterra/node", async (request, reply) => {
  const { workflowId, nodeId, capabilityId, input, context } = request.body;
  
  console.log(`📥 Received task: ${capabilityId}`, { workflowId, nodeId });
  
  try {
    let result;
    const userInput = input?.text || input?.query || input?.message || JSON.stringify(input);
    
    if (capabilityId.includes("chat") || capabilityId.includes("generate")) {
      // Text generation with Flan-T5
      const hfResult = await callHuggingFace(
        FREE_MODELS["text-generation"],
        userInput,
        "text2text-generation"
      );
      result = {
        response: Array.isArray(hfResult) ? hfResult[0]?.generated_text : hfResult?.generated_text || "No response generated",
        model: FREE_MODELS["text-generation"],
      };
    } else if (capabilityId.includes("summarize")) {
      // Summarization with BART
      const hfResult = await callHuggingFace(
        FREE_MODELS["summarization"],
        userInput,
        "summarization"
      );
      result = {
        summary: Array.isArray(hfResult) ? hfResult[0]?.summary_text : hfResult?.summary_text || "Could not summarize",
        model: FREE_MODELS["summarization"],
      };
    } else if (capabilityId.includes("sentiment")) {
      // Sentiment analysis
      const hfResult = await callHuggingFace(
        FREE_MODELS["sentiment"],
        userInput,
        "text-classification"
      );
      result = {
        sentiment: Array.isArray(hfResult) ? hfResult[0] : hfResult,
        model: FREE_MODELS["sentiment"],
      };
    } else {
      // Default: echo back
      result = { echo: userInput, message: "Unknown capability, echoing input" };
    }
    
    console.log(`✅ Task completed:`, result);
    
    return reply.send({
      nodeId,
      workflowId,
      status: "done",
      result,
    });
  } catch (error) {
    console.error(`❌ Task failed:`, error);
    return reply.send({
      nodeId,
      workflowId,
      status: "failed",
      error: error.message,
    });
  }
});

// Register with Nooterra registry on startup
async function registerAgent() {
  try {
    const endpoint = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    
    const response = await fetch(`${REGISTRY_URL}/v1/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        did: AGENT_DID,
        name: "Free LLM Agent",
        endpoint: `${endpoint}/nooterra/node`,
        capabilities: CAPABILITIES,
      }),
    });
    
    if (response.ok) {
      console.log(`✅ Registered with registry: ${AGENT_DID}`);
    } else {
      console.warn(`⚠️ Registration failed:`, await response.text());
    }
  } catch (err) {
    console.warn(`⚠️ Could not register with registry:`, err.message);
  }
}

// Heartbeat to keep agent alive in registry
async function sendHeartbeat() {
  try {
    const endpoint = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    
    await fetch(`${REGISTRY_URL}/v1/agent/heartbeat`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        did: AGENT_DID,
        endpoint: `${endpoint}/nooterra/node`,
        availability: 1,
        queue_depth: 0,
      }),
    });
  } catch (err) {
    // Silent fail for heartbeat
  }
}

// Start server
app.listen({ port: PORT, host: "0.0.0.0" }, async (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  
  console.log(`🤖 Free LLM Agent running on port ${PORT}`);
  console.log(`📡 Capabilities: ${CAPABILITIES.map(c => c.capabilityId).join(", ")}`);
  
  await registerAgent();
  
  // Send heartbeat every 30 seconds
  setInterval(sendHeartbeat, 30000);
});

