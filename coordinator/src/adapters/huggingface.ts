/**
 * HuggingFace Adapter
 * 
 * Connects HuggingFace models to the Nooterra network.
 * Each HF model becomes a callable Nooterra agent.
 * 
 * Supported:
 * - Inference API (hosted models)
 * - Inference Endpoints (dedicated)
 * - Spaces (Gradio apps)
 */

import fetch from "node-fetch";

const HF_API_BASE = "https://api-inference.huggingface.co";
const HF_HUB_API = "https://huggingface.co/api";

export interface HFModel {
  id: string;
  modelId: string;
  author: string;
  tags: string[];
  pipeline_tag: string;
  downloads: number;
  likes: number;
  library_name: string;
}

export interface HFInferenceResult {
  success: boolean;
  result?: any;
  error?: string;
  latency_ms?: number;
}

/**
 * Call a HuggingFace model via Inference API
 */
export async function callHFModel(
  modelId: string,
  inputs: any,
  hfToken?: string
): Promise<HFInferenceResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${HF_API_BASE}/models/${modelId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(hfToken ? { Authorization: `Bearer ${hfToken}` } : {}),
      },
      body: JSON.stringify({ inputs }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `HF API error: ${response.status} - ${error}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const result = await response.json();
    
    return {
      success: true,
      result,
      latency_ms: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      latency_ms: Date.now() - startTime,
    };
  }
}

/**
 * Get popular models from HuggingFace Hub
 */
export async function getPopularModels(
  task?: string,
  limit: number = 100
): Promise<HFModel[]> {
  try {
    let url = `${HF_HUB_API}/models?sort=downloads&direction=-1&limit=${limit}`;
    if (task) {
      url += `&pipeline_tag=${encodeURIComponent(task)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }
    
    return await response.json() as HFModel[];
  } catch (err) {
    console.error("Failed to fetch HF models:", err);
    return [];
  }
}

/**
 * Convert HF pipeline_tag to Nooterra capability
 */
export function hfTaskToCapability(task: string, modelId: string): string {
  const taskMap: Record<string, string> = {
    "text-generation": "cap.llm.generate",
    "text2text-generation": "cap.llm.transform",
    "summarization": "cap.text.summarize",
    "translation": "cap.text.translate",
    "question-answering": "cap.qa.answer",
    "conversational": "cap.chat.conversation",
    "fill-mask": "cap.text.fillmask",
    "text-classification": "cap.text.classify",
    "token-classification": "cap.text.ner",
    "sentiment-analysis": "cap.text.sentiment",
    "image-classification": "cap.image.classify",
    "object-detection": "cap.image.detect",
    "image-segmentation": "cap.image.segment",
    "image-to-text": "cap.image.caption",
    "text-to-image": "cap.image.generate",
    "automatic-speech-recognition": "cap.audio.transcribe",
    "text-to-speech": "cap.audio.speak",
    "audio-classification": "cap.audio.classify",
    "feature-extraction": "cap.embedding.extract",
    "sentence-similarity": "cap.embedding.similarity",
    "zero-shot-classification": "cap.text.zeroshot",
    "table-question-answering": "cap.table.qa",
    "document-question-answering": "cap.document.qa",
    "visual-question-answering": "cap.vision.qa",
  };
  
  const base = taskMap[task] || `cap.hf.${task.replace(/-/g, "_")}`;
  const modelSlug = modelId.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
  
  return `${base}.${modelSlug}.v1`;
}

/**
 * Register HF models as Nooterra agents
 */
export async function registerHFModelsAsAgents(
  models: HFModel[],
  registryUrl: string,
  walletAddress?: string
): Promise<{ registered: number; failed: number }> {
  let registered = 0;
  let failed = 0;

  for (const model of models) {
    try {
      const did = `did:noot:hf:${model.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const capabilityId = hfTaskToCapability(model.pipeline_tag || "text-generation", model.id);
      
      const response = await fetch(`${registryUrl}/v1/agent/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          did,
          name: model.id.split("/").pop() || model.id,
          endpoint: `${HF_API_BASE}/models/${model.id}`,
          walletAddress: walletAddress || null,
          capabilities: [{
            capabilityId,
            description: `HuggingFace model: ${model.id} (${model.pipeline_tag || "unknown"})`,
            tags: [
              "huggingface",
              model.pipeline_tag || "ml",
              model.library_name || "transformers",
              ...(model.tags || []).slice(0, 5),
            ],
            price_cents: calculatePrice(model),
          }],
        }),
      });

      if (response.ok) {
        registered++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }
  }

  return { registered, failed };
}

/**
 * Calculate price based on model popularity/size
 */
function calculatePrice(model: HFModel): number {
  // More popular models can charge more
  if (model.downloads > 1000000) return 25;
  if (model.downloads > 100000) return 15;
  if (model.downloads > 10000) return 10;
  return 5;
}

/**
 * HuggingFace tasks we can import
 */
export const HF_IMPORTABLE_TASKS = [
  "text-generation",
  "text2text-generation", 
  "summarization",
  "translation",
  "question-answering",
  "conversational",
  "text-classification",
  "sentiment-analysis",
  "image-classification",
  "object-detection",
  "image-to-text",
  "text-to-image",
  "automatic-speech-recognition",
  "text-to-speech",
  "feature-extraction",
  "sentence-similarity",
  "zero-shot-classification",
];

