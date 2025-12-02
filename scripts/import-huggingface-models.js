#!/usr/bin/env node
/**
 * NOOTERRA - HuggingFace Model Importer
 * 
 * This script automatically imports HuggingFace models as Nooterra agents.
 * Each model becomes a discoverable agent in the network.
 * 
 * Usage:
 *   HF_TOKEN=hf_xxx REGISTRY_API_KEY=xxx node import-huggingface-models.js
 * 
 * Or interactively:
 *   node import-huggingface-models.js
 */

import crypto from 'crypto';

// Configuration
const HF_TOKEN = process.env.HF_TOKEN || process.argv[2];
const REGISTRY_URL = process.env.REGISTRY_URL || "https://api.nooterra.ai";
const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY || "Zoroluffy444!";

// Task types and their capability mappings
const TASK_MAPPINGS = {
  "text-generation": {
    capabilityId: "cap.text.generate.v1",
    description: "Generate text, complete prompts, write content",
    tags: ["llm", "generation", "text", "writing"]
  },
  "text2text-generation": {
    capabilityId: "cap.text.transform.v1",
    description: "Transform text - rewrite, paraphrase, correct",
    tags: ["text", "transform", "rewrite"]
  },
  "summarization": {
    capabilityId: "cap.text.summarize.v1",
    description: "Summarize long text into concise summaries",
    tags: ["summarization", "tldr", "condensing"]
  },
  "translation": {
    capabilityId: "cap.translate.v1",
    description: "Translate text between languages",
    tags: ["translation", "language", "multilingual"]
  },
  "question-answering": {
    capabilityId: "cap.text.qa.v1",
    description: "Answer questions based on context",
    tags: ["qa", "questions", "knowledge"]
  },
  "text-classification": {
    capabilityId: "cap.text.classify.v1",
    description: "Classify text into categories",
    tags: ["classification", "categorization", "labels"]
  },
  "sentiment-analysis": {
    capabilityId: "cap.text.sentiment.v1",
    description: "Analyze sentiment - positive, negative, neutral",
    tags: ["sentiment", "emotion", "analysis"]
  },
  "token-classification": {
    capabilityId: "cap.text.ner.v1",
    description: "Extract named entities - people, places, organizations",
    tags: ["ner", "entities", "extraction"]
  },
  "fill-mask": {
    capabilityId: "cap.text.fillmask.v1",
    description: "Fill in masked/missing words in text",
    tags: ["fillmask", "completion", "bert"]
  },
  "feature-extraction": {
    capabilityId: "cap.embedding.encode.v1",
    description: "Generate embeddings for semantic search",
    tags: ["embeddings", "vectors", "semantic"]
  },
  "image-classification": {
    capabilityId: "cap.vision.classify.v1",
    description: "Classify images into categories",
    tags: ["vision", "image", "classification"]
  },
  "object-detection": {
    capabilityId: "cap.vision.detect.v1",
    description: "Detect objects in images with bounding boxes",
    tags: ["vision", "detection", "objects"]
  },
  "image-segmentation": {
    capabilityId: "cap.vision.segment.v1",
    description: "Segment images into regions",
    tags: ["vision", "segmentation", "regions"]
  },
  "image-to-text": {
    capabilityId: "cap.vision.caption.v1",
    description: "Generate captions for images",
    tags: ["vision", "caption", "description"]
  },
  "text-to-image": {
    capabilityId: "cap.creative.generate.v1",
    description: "Generate images from text descriptions",
    tags: ["image", "generation", "creative", "art"]
  },
  "automatic-speech-recognition": {
    capabilityId: "cap.audio.transcribe.v1",
    description: "Transcribe audio to text",
    tags: ["audio", "speech", "transcription"]
  },
  "text-to-speech": {
    capabilityId: "cap.audio.tts.v1",
    description: "Convert text to speech audio",
    tags: ["tts", "audio", "voice"]
  },
  "audio-classification": {
    capabilityId: "cap.audio.classify.v1",
    description: "Classify audio content",
    tags: ["audio", "classification", "sound"]
  },
  "zero-shot-classification": {
    capabilityId: "cap.text.zeroshot.v1",
    description: "Classify text without training examples",
    tags: ["zeroshot", "classification", "flexible"]
  },
  "conversational": {
    capabilityId: "cap.llm.chat.v1",
    description: "Have natural conversations",
    tags: ["chat", "conversation", "dialogue"]
  },
  "table-question-answering": {
    capabilityId: "cap.data.tableqa.v1",
    description: "Answer questions about tabular data",
    tags: ["tables", "data", "qa"]
  },
  "document-question-answering": {
    capabilityId: "cap.document.qa.v1",
    description: "Answer questions about documents",
    tags: ["document", "qa", "extraction"]
  },
  "visual-question-answering": {
    capabilityId: "cap.vision.qa.v1",
    description: "Answer questions about images",
    tags: ["vision", "qa", "visual"]
  }
};

// Popular models to prioritize (guaranteed to work)
const PRIORITY_MODELS = [
  // Text Generation
  { id: "google/flan-t5-base", task: "text2text-generation" },
  { id: "google/flan-t5-large", task: "text2text-generation" },
  { id: "google/flan-t5-xl", task: "text2text-generation" },
  { id: "mistralai/Mistral-7B-Instruct-v0.2", task: "text-generation" },
  { id: "meta-llama/Llama-2-7b-chat-hf", task: "conversational" },
  
  // Summarization
  { id: "facebook/bart-large-cnn", task: "summarization" },
  { id: "google/pegasus-xsum", task: "summarization" },
  { id: "philschmid/bart-large-cnn-samsum", task: "summarization" },
  
  // Translation
  { id: "Helsinki-NLP/opus-mt-en-es", task: "translation" },
  { id: "Helsinki-NLP/opus-mt-en-fr", task: "translation" },
  { id: "Helsinki-NLP/opus-mt-en-de", task: "translation" },
  { id: "Helsinki-NLP/opus-mt-en-zh", task: "translation" },
  { id: "facebook/mbart-large-50-many-to-many-mmt", task: "translation" },
  
  // Sentiment & Classification
  { id: "distilbert-base-uncased-finetuned-sst-2-english", task: "sentiment-analysis" },
  { id: "cardiffnlp/twitter-roberta-base-sentiment-latest", task: "sentiment-analysis" },
  { id: "facebook/bart-large-mnli", task: "zero-shot-classification" },
  
  // NER & Token Classification
  { id: "dslim/bert-base-NER", task: "token-classification" },
  { id: "dbmdz/bert-large-cased-finetuned-conll03-english", task: "token-classification" },
  
  // Q&A
  { id: "deepset/roberta-base-squad2", task: "question-answering" },
  { id: "distilbert-base-cased-distilled-squad", task: "question-answering" },
  
  // Embeddings
  { id: "sentence-transformers/all-MiniLM-L6-v2", task: "feature-extraction" },
  { id: "sentence-transformers/all-mpnet-base-v2", task: "feature-extraction" },
  { id: "BAAI/bge-base-en-v1.5", task: "feature-extraction" },
  
  // Vision
  { id: "google/vit-base-patch16-224", task: "image-classification" },
  { id: "facebook/detr-resnet-50", task: "object-detection" },
  { id: "Salesforce/blip-image-captioning-base", task: "image-to-text" },
  
  // Audio
  { id: "openai/whisper-base", task: "automatic-speech-recognition" },
  { id: "openai/whisper-small", task: "automatic-speech-recognition" },
  { id: "facebook/wav2vec2-base-960h", task: "automatic-speech-recognition" },
];

async function fetchModelsFromHub(task, limit = 50) {
  const url = `https://huggingface.co/api/models?pipeline_tag=${task}&sort=downloads&direction=-1&limit=${limit}`;
  
  try {
    const response = await fetch(url, {
      headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${task} models:`, response.status);
      return [];
    }
    
    return await response.json();
  } catch (err) {
    console.error(`Error fetching ${task} models:`, err.message);
    return [];
  }
}

async function registerAgent(model, task) {
  const mapping = TASK_MAPPINGS[task];
  if (!mapping) {
    console.log(`  ⚠️ Unknown task type: ${task}`);
    return false;
  }
  
  const did = `did:noot:hf:${crypto.randomUUID()}`;
  const modelName = model.id || model;
  const shortName = modelName.split('/').pop();
  
  const agent = {
    did,
    name: shortName,
    endpoint: `https://api-inference.huggingface.co/models/${modelName}`,
    capabilities: [{
      capabilityId: `${mapping.capabilityId}`,
      description: `${mapping.description} (${shortName})`,
      tags: [...mapping.tags, "huggingface", shortName.toLowerCase()]
    }]
  };
  
  try {
    const response = await fetch(`${REGISTRY_URL}/v1/agent/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': REGISTRY_API_KEY
      },
      body: JSON.stringify(agent)
    });
    
    if (response.ok) {
      console.log(`  ✅ ${shortName} (${task})`);
      return true;
    } else {
      const error = await response.text();
      console.log(`  ❌ ${shortName}: ${error.slice(0, 50)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ ${shortName}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 NOOTERRA - HuggingFace Model Importer");
  console.log("=========================================");
  console.log("");
  
  if (!HF_TOKEN) {
    console.log("⚠️  No HF_TOKEN provided. Some models may be rate-limited.");
    console.log("   Get a free token at: https://huggingface.co/settings/tokens");
    console.log("");
  } else {
    console.log("✅ HuggingFace token configured");
  }
  
  console.log(`📡 Registry: ${REGISTRY_URL}`);
  console.log("");
  
  let totalRegistered = 0;
  let totalFailed = 0;
  
  // First: Register priority models (known to work well)
  console.log("📦 Registering priority models (guaranteed to work)...");
  console.log("");
  
  for (const model of PRIORITY_MODELS) {
    const success = await registerAgent(model.id, model.task);
    if (success) totalRegistered++;
    else totalFailed++;
  }
  
  console.log("");
  console.log("📦 Fetching popular models from each category...");
  console.log("");
  
  // Then: Fetch top models from each task category
  for (const [task, mapping] of Object.entries(TASK_MAPPINGS)) {
    console.log(`\n🔍 ${task} (${mapping.capabilityId}):`);
    
    const models = await fetchModelsFromHub(task, 10); // Top 10 per category
    
    for (const model of models) {
      // Skip if already in priority list
      if (PRIORITY_MODELS.some(p => p.id === model.id)) continue;
      
      const success = await registerAgent(model.id, task);
      if (success) totalRegistered++;
      else totalFailed++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log("");
  console.log("=========================================");
  console.log(`✅ Successfully registered: ${totalRegistered}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log("");
  console.log("🔍 Verify with:");
  console.log(`   curl -s "https://coord.nooterra.ai/v1/discover?limit=50" | jq '.count'`);
}

main().catch(console.error);

