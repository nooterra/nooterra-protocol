/**
 * Specialized HuggingFace Agents
 * 
 * These are models that can do things general LLMs CANNOT:
 * - Real image analysis (not hallucinated)
 * - Audio processing
 * - Document understanding
 * - Scientific computing
 * - Domain-specific expertise
 */

export interface SpecializedCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tasks: string[];
  topModels: Array<{
    modelId: string;
    name: string;
    description: string;
    capability: string;
    tags: string[];
  }>;
}

export const SPECIALIZED_CATEGORIES: SpecializedCategory[] = [
  {
    id: "vision",
    name: "Computer Vision",
    description: "Real image analysis - not hallucinated like ChatGPT",
    emoji: "👁️",
    tasks: ["image-classification", "object-detection", "image-segmentation", "zero-shot-image-classification"],
    topModels: [
      {
        modelId: "facebook/detr-resnet-50",
        name: "DETR Object Detection",
        description: "Detect and locate objects in images with bounding boxes",
        capability: "cap.vision.detect.detr.v1",
        tags: ["object-detection", "bounding-boxes", "facebook"],
      },
      {
        modelId: "google/vit-base-patch16-224",
        name: "Vision Transformer",
        description: "Classify images into 1000 categories with state-of-the-art accuracy",
        capability: "cap.vision.classify.vit.v1",
        tags: ["image-classification", "google", "transformer"],
      },
      {
        modelId: "facebook/mask2former-swin-base-coco-panoptic",
        name: "Mask2Former Segmentation",
        description: "Pixel-perfect image segmentation for scene understanding",
        capability: "cap.vision.segment.mask2former.v1",
        tags: ["segmentation", "panoptic", "facebook"],
      },
      {
        modelId: "openai/clip-vit-large-patch14",
        name: "CLIP",
        description: "Zero-shot image classification - classify ANY concept without training",
        capability: "cap.vision.zeroshot.clip.v1",
        tags: ["zero-shot", "openai", "multimodal"],
      },
      {
        modelId: "microsoft/Florence-2-large",
        name: "Florence-2",
        description: "Advanced vision-language model for complex visual understanding",
        capability: "cap.vision.understand.florence.v1",
        tags: ["vision-language", "microsoft", "advanced"],
      },
    ],
  },
  {
    id: "audio",
    name: "Audio & Speech",
    description: "Transcribe, generate, and analyze audio",
    emoji: "🎵",
    tasks: ["automatic-speech-recognition", "text-to-speech", "audio-classification", "audio-to-audio"],
    topModels: [
      {
        modelId: "openai/whisper-large-v3",
        name: "Whisper Large",
        description: "State-of-the-art speech recognition in 99+ languages",
        capability: "cap.audio.transcribe.whisper.v1",
        tags: ["speech-recognition", "multilingual", "openai"],
      },
      {
        modelId: "facebook/musicgen-medium",
        name: "MusicGen",
        description: "Generate original music from text descriptions",
        capability: "cap.audio.generate.musicgen.v1",
        tags: ["music-generation", "creative", "facebook"],
      },
      {
        modelId: "microsoft/speecht5_tts",
        name: "SpeechT5 TTS",
        description: "Convert text to natural human speech",
        capability: "cap.audio.speak.speecht5.v1",
        tags: ["text-to-speech", "microsoft"],
      },
      {
        modelId: "MIT/ast-finetuned-audioset-10-10-0.4593",
        name: "Audio Spectrogram Transformer",
        description: "Classify audio into 527 categories (music, speech, environmental sounds)",
        capability: "cap.audio.classify.ast.v1",
        tags: ["audio-classification", "environmental", "mit"],
      },
    ],
  },
  {
    id: "document",
    name: "Document AI",
    description: "Extract data from PDFs, invoices, receipts, forms",
    emoji: "📄",
    tasks: ["document-question-answering", "image-to-text", "table-question-answering"],
    topModels: [
      {
        modelId: "microsoft/layoutlmv3-base",
        name: "LayoutLMv3",
        description: "Understand document layout and extract structured data",
        capability: "cap.document.understand.layoutlm.v1",
        tags: ["document-understanding", "microsoft", "ocr"],
      },
      {
        modelId: "impira/layoutlm-document-qa",
        name: "Document QA",
        description: "Answer questions about documents, invoices, receipts",
        capability: "cap.document.qa.layoutlm.v1",
        tags: ["document-qa", "extraction"],
      },
      {
        modelId: "microsoft/trocr-large-printed",
        name: "TrOCR",
        description: "Extract text from images with state-of-the-art OCR",
        capability: "cap.document.ocr.trocr.v1",
        tags: ["ocr", "text-extraction", "microsoft"],
      },
      {
        modelId: "google/pix2struct-docvqa-large",
        name: "Pix2Struct DocVQA",
        description: "Visual question answering on complex documents",
        capability: "cap.document.vqa.pix2struct.v1",
        tags: ["visual-qa", "google", "documents"],
      },
    ],
  },
  {
    id: "code",
    name: "Code & Programming",
    description: "Code generation, completion, bug detection",
    emoji: "💻",
    tasks: ["text-generation", "text2text-generation"],
    topModels: [
      {
        modelId: "Salesforce/codegen-350M-mono",
        name: "CodeGen",
        description: "Generate code from natural language descriptions",
        capability: "cap.code.generate.codegen.v1",
        tags: ["code-generation", "salesforce"],
      },
      {
        modelId: "bigcode/starcoder",
        name: "StarCoder",
        description: "15B parameter code model trained on 80+ programming languages",
        capability: "cap.code.generate.starcoder.v1",
        tags: ["code-generation", "bigcode", "multilingual"],
      },
      {
        modelId: "microsoft/codebert-base",
        name: "CodeBERT",
        description: "Understand code semantics for search, classification, and analysis",
        capability: "cap.code.understand.codebert.v1",
        tags: ["code-understanding", "microsoft"],
      },
    ],
  },
  {
    id: "science",
    name: "Scientific & Research",
    description: "Protein folding, molecule generation, scientific NLP",
    emoji: "🔬",
    tasks: ["text-generation", "feature-extraction"],
    topModels: [
      {
        modelId: "facebook/esm2_t33_650M_UR50D",
        name: "ESM-2 Protein",
        description: "Predict protein structure and function from sequences",
        capability: "cap.science.protein.esm2.v1",
        tags: ["protein", "biology", "facebook"],
      },
      {
        modelId: "allenai/scibert_scivocab_uncased",
        name: "SciBERT",
        description: "NLP for scientific papers and research documents",
        capability: "cap.science.nlp.scibert.v1",
        tags: ["scientific-nlp", "research", "allenai"],
      },
      {
        modelId: "DeepChem/ChemBERTa-77M-MTR",
        name: "ChemBERTa",
        description: "Understand molecular structures and predict properties",
        capability: "cap.science.chemistry.chemberta.v1",
        tags: ["chemistry", "molecules", "deepchem"],
      },
    ],
  },
  {
    id: "medical",
    name: "Medical & Healthcare",
    description: "Medical image analysis, clinical NLP",
    emoji: "🏥",
    tasks: ["image-classification", "text-classification"],
    topModels: [
      {
        modelId: "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract",
        name: "PubMedBERT",
        description: "Understand medical literature and clinical text",
        capability: "cap.medical.nlp.pubmedbert.v1",
        tags: ["medical-nlp", "pubmed", "microsoft"],
      },
      {
        modelId: "medicalai/ClinicalBERT",
        name: "ClinicalBERT",
        description: "Process clinical notes and electronic health records",
        capability: "cap.medical.clinical.clinicalbert.v1",
        tags: ["clinical", "ehr", "healthcare"],
      },
    ],
  },
  {
    id: "creative",
    name: "Creative & Generative",
    description: "Image generation, style transfer, creative AI",
    emoji: "🎨",
    tasks: ["text-to-image", "image-to-image"],
    topModels: [
      {
        modelId: "stabilityai/stable-diffusion-xl-base-1.0",
        name: "Stable Diffusion XL",
        description: "Generate stunning images from text descriptions",
        capability: "cap.creative.generate.sdxl.v1",
        tags: ["image-generation", "stable-diffusion", "creative"],
      },
      {
        modelId: "lllyasviel/control_v11p_sd15_canny",
        name: "ControlNet Canny",
        description: "Generate images with precise edge/structure control",
        capability: "cap.creative.control.controlnet.v1",
        tags: ["controlnet", "image-control"],
      },
      {
        modelId: "timbrooks/instruct-pix2pix",
        name: "InstructPix2Pix",
        description: "Edit images using natural language instructions",
        capability: "cap.creative.edit.pix2pix.v1",
        tags: ["image-editing", "instruct"],
      },
    ],
  },
  {
    id: "embedding",
    name: "Embeddings & Search",
    description: "Semantic search, similarity, RAG",
    emoji: "🔍",
    tasks: ["feature-extraction", "sentence-similarity"],
    topModels: [
      {
        modelId: "sentence-transformers/all-MiniLM-L6-v2",
        name: "MiniLM Embeddings",
        description: "Fast, efficient sentence embeddings for semantic search",
        capability: "cap.embedding.encode.minilm.v1",
        tags: ["embeddings", "semantic-search", "fast"],
      },
      {
        modelId: "BAAI/bge-large-en-v1.5",
        name: "BGE Large",
        description: "State-of-the-art text embeddings for RAG and search",
        capability: "cap.embedding.encode.bge.v1",
        tags: ["embeddings", "rag", "sota"],
      },
      {
        modelId: "jinaai/jina-embeddings-v2-base-en",
        name: "Jina Embeddings",
        description: "8K context embeddings for long document search",
        capability: "cap.embedding.encode.jina.v1",
        tags: ["embeddings", "long-context", "jina"],
      },
    ],
  },
  {
    id: "translation",
    name: "Translation & Multilingual",
    description: "Translate between 100+ languages",
    emoji: "🌍",
    tasks: ["translation", "text2text-generation"],
    topModels: [
      {
        modelId: "facebook/nllb-200-distilled-600M",
        name: "NLLB-200",
        description: "Translate between 200 languages including low-resource ones",
        capability: "cap.translate.nllb200.v1",
        tags: ["translation", "200-languages", "facebook"],
      },
      {
        modelId: "Helsinki-NLP/opus-mt-en-de",
        name: "OPUS-MT English-German",
        description: "High-quality English to German translation",
        capability: "cap.translate.opus.en_de.v1",
        tags: ["translation", "english", "german"],
      },
      {
        modelId: "facebook/mbart-large-50-many-to-many-mmt",
        name: "mBART-50",
        description: "Multilingual translation between 50 languages",
        capability: "cap.translate.mbart50.v1",
        tags: ["translation", "multilingual", "facebook"],
      },
    ],
  },
  {
    id: "math",
    name: "Math & Reasoning",
    description: "Solve equations, mathematical reasoning",
    emoji: "🧮",
    tasks: ["text-generation", "text2text-generation"],
    topModels: [
      {
        modelId: "EleutherAI/llemma_7b",
        name: "Llemma",
        description: "Mathematical reasoning and proof generation",
        capability: "cap.math.reason.llemma.v1",
        tags: ["math", "reasoning", "proofs"],
      },
      {
        modelId: "deepseek-ai/deepseek-math-7b-instruct",
        name: "DeepSeek Math",
        description: "Advanced mathematical problem solving",
        capability: "cap.math.solve.deepseek.v1",
        tags: ["math", "problem-solving", "deepseek"],
      },
    ],
  },
];

/**
 * Get all specialized models across all categories
 */
export function getAllSpecializedModels() {
  const models: Array<{
    modelId: string;
    name: string;
    description: string;
    capability: string;
    category: string;
    categoryEmoji: string;
    tags: string[];
  }> = [];

  for (const category of SPECIALIZED_CATEGORIES) {
    for (const model of category.topModels) {
      models.push({
        ...model,
        category: category.id,
        categoryEmoji: category.emoji,
      });
    }
  }

  return models;
}

/**
 * Example workflows that showcase agent collaboration
 */
export const EXAMPLE_WORKFLOWS = [
  {
    id: "document-to-insights",
    name: "Document to Insights",
    description: "Extract data from a document, translate it, and analyze sentiment",
    nodes: {
      extract: {
        capability: "cap.document.ocr.trocr.v1",
        description: "Extract text from the document image",
      },
      summarize: {
        capability: "cap.text.summarize",
        dependsOn: ["extract"],
        description: "Summarize the extracted text",
      },
      translate: {
        capability: "cap.translate.nllb200.v1",
        dependsOn: ["summarize"],
        description: "Translate summary to target language",
      },
      sentiment: {
        capability: "cap.text.sentiment",
        dependsOn: ["translate"],
        description: "Analyze sentiment of the translation",
      },
    },
  },
  {
    id: "image-research",
    name: "Image Research Pipeline",
    description: "Detect objects, classify scene, and generate a research report",
    nodes: {
      detect: {
        capability: "cap.vision.detect.detr.v1",
        description: "Detect all objects in the image",
      },
      classify: {
        capability: "cap.vision.classify.vit.v1",
        description: "Classify the overall scene",
      },
      describe: {
        capability: "cap.vision.understand.florence.v1",
        dependsOn: ["detect", "classify"],
        description: "Generate detailed description from detections",
      },
      research: {
        capability: "cap.science.nlp.scibert.v1",
        dependsOn: ["describe"],
        description: "Find related scientific literature",
      },
    },
  },
  {
    id: "audio-content-pipeline",
    name: "Audio Content Pipeline",
    description: "Transcribe audio, translate, and generate summary with TTS",
    nodes: {
      transcribe: {
        capability: "cap.audio.transcribe.whisper.v1",
        description: "Transcribe the audio file",
      },
      translate: {
        capability: "cap.translate.nllb200.v1",
        dependsOn: ["transcribe"],
        description: "Translate transcription",
      },
      summarize: {
        capability: "cap.text.summarize",
        dependsOn: ["translate"],
        description: "Create a concise summary",
      },
      speak: {
        capability: "cap.audio.speak.speecht5.v1",
        dependsOn: ["summarize"],
        description: "Convert summary to speech",
      },
    },
  },
  {
    id: "medical-analysis",
    name: "Medical Document Analysis",
    description: "Process medical documents and extract clinical insights",
    nodes: {
      ocr: {
        capability: "cap.document.ocr.trocr.v1",
        description: "Extract text from medical document",
      },
      clinical_nlp: {
        capability: "cap.medical.clinical.clinicalbert.v1",
        dependsOn: ["ocr"],
        description: "Extract clinical entities and codes",
      },
      literature: {
        capability: "cap.medical.nlp.pubmedbert.v1",
        dependsOn: ["clinical_nlp"],
        description: "Find relevant medical literature",
      },
    },
  },
  {
    id: "code-review",
    name: "AI Code Review",
    description: "Analyze code, detect issues, and suggest improvements",
    nodes: {
      understand: {
        capability: "cap.code.understand.codebert.v1",
        description: "Analyze code structure and semantics",
      },
      generate_tests: {
        capability: "cap.code.generate.starcoder.v1",
        dependsOn: ["understand"],
        description: "Generate unit tests",
      },
      document: {
        capability: "cap.code.generate.codegen.v1",
        dependsOn: ["understand"],
        description: "Generate documentation",
      },
    },
  },
  {
    id: "creative-pipeline",
    name: "Creative Image Pipeline",
    description: "Generate image, edit it, and create variations",
    nodes: {
      generate: {
        capability: "cap.creative.generate.sdxl.v1",
        description: "Generate base image from prompt",
      },
      edit: {
        capability: "cap.creative.edit.pix2pix.v1",
        dependsOn: ["generate"],
        description: "Apply style edits to the image",
      },
      control: {
        capability: "cap.creative.control.controlnet.v1",
        dependsOn: ["edit"],
        description: "Create controlled variations",
      },
    },
  },
];

/**
 * Total count of specialized models
 */
export const TOTAL_SPECIALIZED_MODELS = getAllSpecializedModels().length;

