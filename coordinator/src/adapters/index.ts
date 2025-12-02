/**
 * Nooterra Adapters
 * 
 * These adapters allow external AI services to be used as Nooterra agents.
 * The coordinator routes requests to the appropriate adapter based on the endpoint.
 * 
 * Supported Platforms:
 * - HuggingFace Inference API
 * - OpenAI-compatible APIs (uncloseai, Together, local)
 * - Replicate
 * - Custom webhooks
 */

import fetch from "node-fetch";

export interface AdapterRequest {
  endpoint: string;
  capability: string;
  inputs: any;
  config?: Record<string, any>;
}

export interface AdapterResponse {
  success: boolean;
  result?: any;
  error?: string;
  latency_ms: number;
  tokens_used?: number;
}

/**
 * Detect which adapter to use based on endpoint URL
 */
export function detectAdapter(endpoint: string): string {
  if (endpoint.includes("huggingface.co") || endpoint.includes("hf.space")) {
    return "huggingface";
  }
  if (endpoint.includes("api.openai.com") || 
      endpoint.includes("unturf.com") ||
      endpoint.includes("together.xyz") ||
      endpoint.includes("localhost:11434") ||
      endpoint.endsWith("/v1") ||
      endpoint.endsWith("/v1/")) {
    return "openai";
  }
  if (endpoint.includes("replicate.com")) {
    return "replicate";
  }
  if (endpoint.includes("gradio") || endpoint.includes(".hf.space")) {
    return "gradio";
  }
  return "webhook"; // Default to generic webhook
}

/**
 * Call HuggingFace Inference API
 */
async function callHuggingFace(req: AdapterRequest): Promise<AdapterResponse> {
  const startTime = Date.now();
  
  try {
    const hfToken = req.config?.hf_token || process.env.HF_TOKEN;
    
    const response = await fetch(req.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(hfToken ? { Authorization: `Bearer ${hfToken}` } : {}),
      },
      body: JSON.stringify({
        inputs: req.inputs.query || req.inputs.text || req.inputs.prompt || req.inputs,
        parameters: req.inputs.parameters || {},
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `HuggingFace error: ${response.status} - ${error}`,
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
 * Call OpenAI-compatible API (works with uncloseai, Together, local, etc.)
 */
async function callOpenAI(req: AdapterRequest): Promise<AdapterResponse> {
  const startTime = Date.now();
  
  try {
    const apiKey = req.config?.api_key || process.env.OPENAI_API_KEY;
    const baseUrl = req.endpoint.replace(/\/+$/, "");
    
    // Determine if this is a chat or completion request
    const messages = req.inputs.messages || [
      { role: "user", content: req.inputs.query || req.inputs.prompt || req.inputs.text || JSON.stringify(req.inputs) }
    ];

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: req.inputs.model || req.config?.model || "gpt-3.5-turbo",
        messages,
        max_tokens: req.inputs.max_tokens || 1000,
        temperature: req.inputs.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `OpenAI API error: ${response.status} - ${error}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text;
    
    return {
      success: true,
      result: {
        response: content,
        raw: data,
      },
      latency_ms: Date.now() - startTime,
      tokens_used: data.usage?.total_tokens,
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
 * Call Replicate API
 */
async function callReplicate(req: AdapterRequest): Promise<AdapterResponse> {
  const startTime = Date.now();
  
  try {
    const apiKey = req.config?.replicate_token || process.env.REPLICATE_API_TOKEN;
    
    if (!apiKey) {
      return {
        success: false,
        error: "Replicate API token required",
        latency_ms: Date.now() - startTime,
      };
    }

    // Extract model version from endpoint
    const modelMatch = req.endpoint.match(/replicate\.com\/([^\/]+\/[^\/]+)/);
    const model = modelMatch ? modelMatch[1] : req.inputs.model;

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({
        version: req.inputs.version || model,
        input: req.inputs,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Replicate error: ${response.status} - ${error}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const prediction = await response.json() as any;
    
    // Poll for result if needed
    if (prediction.status === "starting" || prediction.status === "processing") {
      // TODO: Implement polling
      return {
        success: true,
        result: { prediction_id: prediction.id, status: prediction.status },
        latency_ms: Date.now() - startTime,
      };
    }
    
    return {
      success: true,
      result: prediction.output,
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
 * Call Gradio Space API
 */
async function callGradio(req: AdapterRequest): Promise<AdapterResponse> {
  const startTime = Date.now();
  
  try {
    // Gradio spaces have /api/predict endpoint
    const apiUrl = req.endpoint.replace(/\/$/, "") + "/api/predict";
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: Array.isArray(req.inputs) ? req.inputs : [req.inputs.query || req.inputs.text || JSON.stringify(req.inputs)],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Gradio error: ${response.status} - ${error}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const data = await response.json() as any;
    
    return {
      success: true,
      result: data.data || data,
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
 * Call generic webhook endpoint
 */
async function callWebhook(req: AdapterRequest): Promise<AdapterResponse> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(req.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.config?.headers || {}),
      },
      body: JSON.stringify(req.inputs),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Webhook error: ${response.status} - ${error}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const data = await response.json();
    
    return {
      success: true,
      result: data,
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
 * Main adapter dispatcher - routes to the appropriate adapter
 */
export async function callExternalAgent(req: AdapterRequest): Promise<AdapterResponse> {
  const adapter = detectAdapter(req.endpoint);
  
  switch (adapter) {
    case "huggingface":
      return callHuggingFace(req);
    case "openai":
      return callOpenAI(req);
    case "replicate":
      return callReplicate(req);
    case "gradio":
      return callGradio(req);
    default:
      return callWebhook(req);
  }
}

/**
 * Test if an endpoint is reachable and working
 */
export async function testEndpoint(endpoint: string): Promise<{ ok: boolean; adapter: string; latency_ms: number }> {
  const adapter = detectAdapter(endpoint);
  const startTime = Date.now();
  
  try {
    // Just do a HEAD request to check if it's reachable
    const response = await fetch(endpoint, { method: "HEAD" });
    return {
      ok: response.ok || response.status === 405, // 405 = method not allowed, but endpoint exists
      adapter,
      latency_ms: Date.now() - startTime,
    };
  } catch {
    return {
      ok: false,
      adapter,
      latency_ms: Date.now() - startTime,
    };
  }
}

