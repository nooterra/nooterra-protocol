/**
 * Register Free External AI Agents with Nooterra
 * 
 * These agents use free endpoints from uncloseai.com and HuggingFace
 * They have proper ACARDs and DIDs but point to external inference APIs
 */

const REGISTRY_URL = process.env.REGISTRY_URL || "https://api.nooterra.ai";
const COORD_URL = process.env.COORD_URL || "https://coord.nooterra.ai";

// Free agents to register
const FREE_AGENTS = [
  // ============================================
  // UNCLOSEAI.COM FREE ENDPOINTS (OpenAI-compatible)
  // ============================================
  {
    did: "did:noot:uncloseai:hermes",
    name: "Hermes 3 (Free)",
    endpoint: "https://hermes.ai.unturf.com/v1/chat/completions",
    endpointType: "openai-compatible",
    description: "Free general-purpose conversational AI powered by Hermes-3-Llama-3.1-8B",
    capabilities: [
      {
        capabilityId: "cap.llm.chat.hermes.v1",
        description: "General purpose chat and text generation",
        tags: ["llm", "chat", "free", "conversational", "hermes"],
        price_cents: 0,
        inputSchema: {
          type: "object",
          properties: {
            messages: { type: "array", description: "Chat messages" },
            prompt: { type: "string", description: "Text prompt" }
          }
        },
        outputSchema: {
          type: "object", 
          properties: {
            response: { type: "string" },
            model: { type: "string" }
          }
        }
      },
      {
        capabilityId: "cap.text.generate.free.v1",
        description: "Free text generation and completion",
        tags: ["llm", "generation", "free", "text"],
        price_cents: 0,
      },
      {
        capabilityId: "cap.text.qa.free.v1",
        description: "Question answering and knowledge retrieval",
        tags: ["qa", "knowledge", "free"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "uncloseai.com",
      model: "NousResearch/Hermes-3-Llama-3.1-8B",
      rateLimit: "free tier",
      documentation: "https://uncloseai.com"
    }
  },
  {
    did: "did:noot:uncloseai:qwen-coder",
    name: "Qwen 3 Coder (Free)",
    endpoint: "https://qwen.ai.unturf.com/v1/chat/completions",
    endpointType: "openai-compatible",
    description: "Free specialized coding AI powered by Qwen 3 Coder 30B",
    capabilities: [
      {
        capabilityId: "cap.code.generate.qwen.v1",
        description: "Code generation and completion in any language",
        tags: ["code", "programming", "free", "qwen"],
        price_cents: 0,
      },
      {
        capabilityId: "cap.code.review.free.v1",
        description: "Code review and suggestions",
        tags: ["code", "review", "free"],
        price_cents: 0,
      },
      {
        capabilityId: "cap.code.explain.free.v1",
        description: "Explain code and programming concepts",
        tags: ["code", "explain", "education", "free"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "uncloseai.com",
      model: "Qwen 3 Coder 30B",
      rateLimit: "free tier",
      documentation: "https://uncloseai.com"
    }
  },
  {
    did: "did:noot:uncloseai:tts",
    name: "Text-to-Speech (Free)",
    endpoint: "https://speech.ai.unturf.com/v1/audio/speech",
    endpointType: "openai-compatible",
    description: "Free text-to-speech synthesis",
    capabilities: [
      {
        capabilityId: "cap.audio.tts.free.v1",
        description: "Convert text to natural speech audio",
        tags: ["tts", "audio", "speech", "free"],
        price_cents: 0,
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string", description: "Text to convert to speech" },
            voice: { type: "string", description: "Voice selection" }
          }
        }
      }
    ],
    metadata: {
      provider: "uncloseai.com",
      rateLimit: "free tier",
      documentation: "https://uncloseai.com"
    }
  },

  // ============================================
  // HUGGINGFACE FREE INFERENCE API
  // ============================================
  {
    did: "did:noot:hf:flan-t5",
    name: "Flan-T5 (Free)",
    endpoint: "https://api-inference.huggingface.co/models/google/flan-t5-base",
    endpointType: "huggingface",
    description: "Free instruction-following model for Q&A and text generation",
    capabilities: [
      {
        capabilityId: "cap.text.generate.flan.v1",
        description: "Text generation following instructions",
        tags: ["llm", "instruction", "free", "flan"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "HuggingFace",
      model: "google/flan-t5-base",
      rateLimit: "free tier (rate limited)"
    }
  },
  {
    did: "did:noot:hf:bart-summarizer",
    name: "BART Summarizer (Free)",
    endpoint: "https://api-inference.huggingface.co/models/facebook/bart-large-cnn",
    endpointType: "huggingface",
    description: "Free text summarization model",
    capabilities: [
      {
        capabilityId: "cap.text.summarize.bart.v1",
        description: "Summarize long texts into concise summaries",
        tags: ["summarization", "text", "free", "bart"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "HuggingFace",
      model: "facebook/bart-large-cnn"
    }
  },
  {
    did: "did:noot:hf:sentiment",
    name: "Sentiment Analyzer (Free)",
    endpoint: "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
    endpointType: "huggingface",
    description: "Free sentiment analysis - detect positive/negative tone",
    capabilities: [
      {
        capabilityId: "cap.text.sentiment.free.v1",
        description: "Analyze sentiment of text (positive/negative)",
        tags: ["sentiment", "classification", "free"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "HuggingFace",
      model: "distilbert-base-uncased-finetuned-sst-2-english"
    }
  },
  {
    did: "did:noot:hf:ner",
    name: "Named Entity Recognition (Free)",
    endpoint: "https://api-inference.huggingface.co/models/dslim/bert-base-NER",
    endpointType: "huggingface",
    description: "Free entity extraction - find people, places, organizations",
    capabilities: [
      {
        capabilityId: "cap.text.ner.free.v1",
        description: "Extract named entities (people, places, orgs) from text",
        tags: ["ner", "entities", "extraction", "free"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "HuggingFace", 
      model: "dslim/bert-base-NER"
    }
  },
  {
    did: "did:noot:hf:translator",
    name: "Translator EN→ES (Free)",
    endpoint: "https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-en-es",
    endpointType: "huggingface",
    description: "Free English to Spanish translation",
    capabilities: [
      {
        capabilityId: "cap.translate.en-es.free.v1",
        description: "Translate English text to Spanish",
        tags: ["translation", "spanish", "free"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "HuggingFace",
      model: "Helsinki-NLP/opus-mt-en-es"
    }
  },
  {
    did: "did:noot:hf:embeddings",
    name: "Text Embeddings (Free)",
    endpoint: "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
    endpointType: "huggingface",
    description: "Free semantic text embeddings for search and similarity",
    capabilities: [
      {
        capabilityId: "cap.embedding.encode.free.v1",
        description: "Generate semantic embeddings for text",
        tags: ["embeddings", "semantic", "search", "free"],
        price_cents: 0,
      }
    ],
    metadata: {
      provider: "HuggingFace",
      model: "sentence-transformers/all-MiniLM-L6-v2"
    }
  }
];

async function registerAgent(agent) {
  console.log(`\n📝 Registering: ${agent.name} (${agent.did})`);
  
  // Build ACARD
  const acard = {
    "@context": "https://nooterra.ai/acard/v1",
    did: agent.did,
    name: agent.name,
    description: agent.description,
    endpoint: agent.endpoint,
    endpointType: agent.endpointType || "nooterra",
    capabilities: agent.capabilities,
    metadata: agent.metadata || {},
    version: 1,
    created: new Date().toISOString(),
  };
  
  try {
    const response = await fetch(`${REGISTRY_URL}/v1/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        did: agent.did,
        name: agent.name,
        endpoint: agent.endpoint,
        capabilities: agent.capabilities,
        acard: acard,
      }),
    });
    
    if (response.ok) {
      console.log(`   ✅ Registered successfully!`);
      console.log(`   📡 Endpoint: ${agent.endpoint}`);
      console.log(`   🎯 Capabilities: ${agent.capabilities.map(c => c.capabilityId).join(", ")}`);
      return true;
    } else {
      const error = await response.text();
      console.log(`   ❌ Registration failed: ${error}`);
      return false;
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 Registering Free AI Agents with Nooterra Network");
  console.log("=" .repeat(60));
  console.log(`📡 Registry: ${REGISTRY_URL}`);
  console.log(`🎯 Agents to register: ${FREE_AGENTS.length}`);
  
  let success = 0;
  let failed = 0;
  
  for (const agent of FREE_AGENTS) {
    const result = await registerAgent(agent);
    if (result) success++;
    else failed++;
  }
  
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Successfully registered: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log("\n🔍 Verify with: curl " + COORD_URL + "/v1/discover?limit=20");
}

main().catch(console.error);

