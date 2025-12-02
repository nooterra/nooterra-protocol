/**
 * Agent Input Schema Specification
 * 
 * Non-conversational agents (vision, audio, etc.) can't "ask" for data.
 * This spec defines how agents declare their input requirements so the
 * coordinator can validate inputs BEFORE dispatching.
 * 
 * The flow:
 * 1. Agent Card (ACARD) declares input schemas for each capability
 * 2. Before dispatch, coordinator checks if inputs match schema
 * 3. If inputs are missing/invalid, coordinator asks user (not the agent)
 * 4. Agent receives valid inputs, returns structured response
 */

// ============================================
// INPUT TYPE DEFINITIONS
// ============================================

export type InputType = 
  | "text"           // Plain text string
  | "image"          // Image file (base64 or URL)
  | "audio"          // Audio file (base64 or URL)
  | "video"          // Video file (base64 or URL)
  | "document"       // PDF, DOC, etc.
  | "url"            // Web URL
  | "json"           // Structured JSON object
  | "number"         // Numeric value
  | "boolean"        // True/false
  | "array"          // Array of items
  | "file"           // Generic file
  | "embedding"      // Vector embedding
  | "coordinates"    // Lat/lng pair
  | "datetime";      // ISO datetime string

// ============================================
// INPUT SCHEMA DEFINITION
// ============================================

export interface InputField {
  name: string;                    // Field identifier
  type: InputType;                 // Data type
  required: boolean;               // Is this field mandatory?
  description: string;             // Human-readable description
  
  // Type-specific constraints
  constraints?: {
    // For text
    minLength?: number;
    maxLength?: number;
    pattern?: string;              // Regex pattern
    
    // For numbers
    min?: number;
    max?: number;
    
    // For files
    maxSizeBytes?: number;
    allowedMimeTypes?: string[];   // e.g., ["image/png", "image/jpeg"]
    
    // For arrays
    minItems?: number;
    maxItems?: number;
    itemType?: InputType;
    
    // For enums
    enum?: string[];               // Allowed values
  };
  
  // Fallback and defaults
  default?: any;                   // Default value if not provided
  fallbackFrom?: string;           // Try to get from another field
  
  // UI hints
  placeholder?: string;            // Placeholder text
  examples?: any[];                // Example values
  uiWidget?: "textarea" | "file-upload" | "dropdown" | "slider" | "color-picker";
}

export interface CapabilityInputSchema {
  capabilityId: string;
  inputs: InputField[];
  
  // What this capability produces
  outputType: InputType;
  outputDescription: string;
  
  // Pre-validation hooks
  preValidation?: {
    // Custom validation function name
    validator?: string;
    // Error message if validation fails
    errorMessage?: string;
  };
}

// ============================================
// AGENT RESPONSE PROTOCOL
// ============================================

export type AgentResponseStatus = 
  | "success"           // Task completed successfully
  | "needs_input"       // Missing required input - specify what's needed
  | "invalid_input"     // Input provided but wrong format/type
  | "processing"        // Still working (for async tasks)
  | "error"             // Failed with error
  | "rate_limited"      // Too many requests
  | "unavailable";      // Agent temporarily down

export interface AgentResponse {
  status: AgentResponseStatus;
  
  // For success
  result?: any;
  
  // For needs_input - what's missing
  missingInputs?: Array<{
    field: string;
    type: InputType;
    description: string;
    required: boolean;
  }>;
  
  // For invalid_input - what's wrong
  validationErrors?: Array<{
    field: string;
    error: string;
    expected: string;
    received: string;
  }>;
  
  // For error
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  
  // Metrics
  metrics?: {
    latency_ms: number;
    tokens_used?: number;
    cost_cents?: number;
  };
}

// ============================================
// EXAMPLE SCHEMAS FOR COMMON AGENTS
// ============================================

export const VISION_AGENT_SCHEMA: CapabilityInputSchema = {
  capabilityId: "cap.vision.detect.v1",
  inputs: [
    {
      name: "image",
      type: "image",
      required: true,
      description: "Image to analyze (JPEG, PNG, WebP)",
      constraints: {
        maxSizeBytes: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      placeholder: "Upload an image or paste a URL",
      uiWidget: "file-upload",
    },
    {
      name: "confidence_threshold",
      type: "number",
      required: false,
      description: "Minimum confidence score (0-1)",
      constraints: { min: 0, max: 1 },
      default: 0.5,
    },
  ],
  outputType: "json",
  outputDescription: "Array of detected objects with bounding boxes and confidence scores",
};

export const AUDIO_TRANSCRIBE_SCHEMA: CapabilityInputSchema = {
  capabilityId: "cap.audio.transcribe.v1",
  inputs: [
    {
      name: "audio",
      type: "audio",
      required: true,
      description: "Audio file to transcribe (MP3, WAV, M4A)",
      constraints: {
        maxSizeBytes: 25 * 1024 * 1024, // 25MB
        allowedMimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm"],
      },
      uiWidget: "file-upload",
    },
    {
      name: "language",
      type: "text",
      required: false,
      description: "Language code (e.g., 'en', 'es', 'fr'). Auto-detect if not specified.",
      constraints: {
        pattern: "^[a-z]{2}(-[A-Z]{2})?$",
      },
      examples: ["en", "es", "fr", "de", "ja"],
    },
  ],
  outputType: "json",
  outputDescription: "Transcribed text with timestamps and confidence",
};

export const OCR_SCHEMA: CapabilityInputSchema = {
  capabilityId: "cap.document.ocr.v1",
  inputs: [
    {
      name: "image",
      type: "image",
      required: true,
      description: "Document image to extract text from",
      constraints: {
        maxSizeBytes: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/tiff", "application/pdf"],
      },
      uiWidget: "file-upload",
    },
  ],
  outputType: "text",
  outputDescription: "Extracted text from the document",
};

export const IMAGE_GENERATION_SCHEMA: CapabilityInputSchema = {
  capabilityId: "cap.creative.generate.v1",
  inputs: [
    {
      name: "prompt",
      type: "text",
      required: true,
      description: "Text description of the image to generate",
      constraints: {
        minLength: 10,
        maxLength: 1000,
      },
      placeholder: "A beautiful sunset over mountains...",
    },
    {
      name: "negative_prompt",
      type: "text",
      required: false,
      description: "Things to avoid in the generated image",
      constraints: {
        maxLength: 500,
      },
    },
    {
      name: "size",
      type: "text",
      required: false,
      description: "Output image size",
      constraints: {
        enum: ["256x256", "512x512", "1024x1024", "1024x768", "768x1024"],
      },
      default: "512x512",
    },
  ],
  outputType: "image",
  outputDescription: "Generated image as base64 or URL",
};

export const TRANSLATION_SCHEMA: CapabilityInputSchema = {
  capabilityId: "cap.translate.v1",
  inputs: [
    {
      name: "text",
      type: "text",
      required: true,
      description: "Text to translate",
      constraints: {
        minLength: 1,
        maxLength: 10000,
      },
    },
    {
      name: "target_language",
      type: "text",
      required: true,  // THIS is what the agent needs but can't ask for!
      description: "Target language code (e.g., 'es' for Spanish)",
      constraints: {
        pattern: "^[a-z]{2}(-[A-Z]{2})?$",
      },
      examples: ["es", "fr", "de", "ja", "zh", "ko", "pt", "ru"],
    },
    {
      name: "source_language",
      type: "text",
      required: false,
      description: "Source language code (auto-detect if not specified)",
    },
  ],
  outputType: "text",
  outputDescription: "Translated text",
};

export const EMBEDDING_SCHEMA: CapabilityInputSchema = {
  capabilityId: "cap.embedding.encode.v1",
  inputs: [
    {
      name: "text",
      type: "text",
      required: true,
      description: "Text to convert to embedding vector",
      constraints: {
        minLength: 1,
        maxLength: 8192,
      },
    },
  ],
  outputType: "embedding",
  outputDescription: "Vector embedding (array of floats)",
};

// ============================================
// SCHEMA REGISTRY
// ============================================

export const INPUT_SCHEMAS: Record<string, CapabilityInputSchema> = {
  "cap.vision.detect.v1": VISION_AGENT_SCHEMA,
  "cap.vision.detect.detr.v1": VISION_AGENT_SCHEMA,
  "cap.vision.classify.v1": VISION_AGENT_SCHEMA,
  "cap.vision.classify.vit.v1": VISION_AGENT_SCHEMA,
  "cap.audio.transcribe.v1": AUDIO_TRANSCRIBE_SCHEMA,
  "cap.audio.transcribe.whisper.v1": AUDIO_TRANSCRIBE_SCHEMA,
  "cap.document.ocr.v1": OCR_SCHEMA,
  "cap.document.ocr.trocr.v1": OCR_SCHEMA,
  "cap.creative.generate.v1": IMAGE_GENERATION_SCHEMA,
  "cap.creative.generate.sdxl.v1": IMAGE_GENERATION_SCHEMA,
  "cap.translate.v1": TRANSLATION_SCHEMA,
  "cap.translate.opus.v1": TRANSLATION_SCHEMA,
  "cap.translate.nllb200.v1": TRANSLATION_SCHEMA,
  "cap.embedding.encode.v1": EMBEDDING_SCHEMA,
  "cap.embedding.encode.minilm.v1": EMBEDDING_SCHEMA,
};

// ============================================
// VALIDATION UTILITIES
// ============================================

export function validateInputs(
  capabilityId: string,
  inputs: Record<string, any>
): { valid: boolean; errors: Array<{ field: string; error: string }> } {
  const schema = INPUT_SCHEMAS[capabilityId];
  
  if (!schema) {
    // No schema defined - assume text input is fine
    return { valid: true, errors: [] };
  }
  
  const errors: Array<{ field: string; error: string }> = [];
  
  for (const field of schema.inputs) {
    const value = inputs[field.name];
    
    // Check required fields
    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push({
        field: field.name,
        error: `Missing required input: ${field.description}`,
      });
      continue;
    }
    
    // Skip validation for optional empty fields
    if (!field.required && (value === undefined || value === null || value === "")) {
      continue;
    }
    
    // Type-specific validation
    if (field.constraints) {
      const c = field.constraints;
      
      if (field.type === "text" && typeof value === "string") {
        if (c.minLength && value.length < c.minLength) {
          errors.push({ field: field.name, error: `Text too short (min ${c.minLength} chars)` });
        }
        if (c.maxLength && value.length > c.maxLength) {
          errors.push({ field: field.name, error: `Text too long (max ${c.maxLength} chars)` });
        }
        if (c.pattern && !new RegExp(c.pattern).test(value)) {
          errors.push({ field: field.name, error: `Invalid format` });
        }
        if (c.enum && !c.enum.includes(value)) {
          errors.push({ field: field.name, error: `Must be one of: ${c.enum.join(", ")}` });
        }
      }
      
      if (field.type === "number" && typeof value === "number") {
        if (c.min !== undefined && value < c.min) {
          errors.push({ field: field.name, error: `Value too low (min ${c.min})` });
        }
        if (c.max !== undefined && value > c.max) {
          errors.push({ field: field.name, error: `Value too high (max ${c.max})` });
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getMissingInputs(
  capabilityId: string,
  inputs: Record<string, any>
): InputField[] {
  const schema = INPUT_SCHEMAS[capabilityId];
  
  if (!schema) {
    return [];
  }
  
  return schema.inputs.filter(field => {
    if (!field.required) return false;
    const value = inputs[field.name];
    return value === undefined || value === null || value === "";
  });
}

export function getInputPromptForAgent(capabilityId: string): string | null {
  const schema = INPUT_SCHEMAS[capabilityId];
  
  if (!schema) {
    return null;
  }
  
  const required = schema.inputs.filter(f => f.required);
  
  if (required.length === 0) {
    return null;
  }
  
  const descriptions = required.map(f => {
    let desc = `• **${f.name}**: ${f.description}`;
    if (f.examples && f.examples.length > 0) {
      desc += ` (e.g., ${f.examples.slice(0, 3).join(", ")})`;
    }
    if (f.constraints?.enum) {
      desc += ` [${f.constraints.enum.join(" | ")}]`;
    }
    return desc;
  });
  
  return `This agent requires:\n\n${descriptions.join("\n")}`;
}

