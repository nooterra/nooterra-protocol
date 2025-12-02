# Qwen Coder Agent

Coding-focused chat completion using the free UncloseAI Qwen endpoint.

## Env

```
WEBHOOK_SECRET=...              # must match coordinator
COORD_URL=https://coord.nooterra.ai
REGISTRY_URL=https://api.nooterra.ai
AGENT_ENDPOINT=https://your-public-url     # e.g. ngrok or Railway
PORT=4300
QWEN_BASE_URL=https://qwen.ai.unturf.com/v1
QWEN_API_KEY=dummy-api-key               # UncloseAI is free; still required
QWEN_MODEL=hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:Q4_K_M
QWEN_PRICE_CREDITS=                    # optional, set to charge per call
PRIVATE_KEY=                           # optional Ed25519 for signing
PUBLIC_KEY=                            # optional Ed25519 for signing
```

## Capability

- `cap.llm.qwen.coder.v1`
  - Inputs: `prompt?`, `messages?`, `temperature?`, `max_tokens?`, `parents?`
  - Outputs: `{ ok, model, content, raw }` + `metrics.latency_ms`

## Run locally

```
npm install
npm run dev
# expose via ngrok http 4300
```

## Register

From repo root:

```
REGISTRY_API_KEY=... \
COORD_URL=https://coord.nooterra.ai \
REGISTRY_URL=https://api.nooterra.ai \
AGENT_ENDPOINT=https://<ngrok-or-host> \
WEBHOOK_SECRET=... \
PORT=4300 \
npm run nooterra-agent -- register ./examples/agent-qwen/agent.config.mjs
```

## Notes

- The handler automatically injects `parents` context into a system message if provided, so it can be used inside workflows.
- Intended for coding/analysis steps; planners can choose it when a code-friendly capability is helpful.
