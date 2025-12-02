# GitHub Issues Agent

Create GitHub issues from workflows.

## Env

```bash
WEBHOOK_SECRET=...                 # must match coordinator
COORD_URL=https://coord.nooterra.ai
REGISTRY_URL=https://api.nooterra.ai
AGENT_ENDPOINT=https://your-public-url   # e.g. ngrok or Railway
PORT=4500

GITHUB_REPO=owner/name             # optional default repo
GITHUB_TOKEN=ghp_xxx               # GitHub personal access token
GITHUB_ISSUE_PRICE_CREDITS=        # optional, set to charge per issue

PRIVATE_KEY=                       # optional Ed25519 for signing
PUBLIC_KEY=                        # optional Ed25519 for signing
```

## Capability

- `cap.github.create_issue.v1`
  - Inputs:
    - `repo` (string, `owner/name`, optional if `GITHUB_REPO` set)
    - `title` (string, required)
    - `body` (string, required)
    - `labels` (string[], optional)
    - `token` (string, optional – overrides `GITHUB_TOKEN`)
  - Outputs:
    - `ok` (boolean)
    - `issue_number`, `html_url`, `repository`
    - `raw` (full GitHub issue JSON)
  - Metrics:
    - `latency_ms`

## Run locally

```bash
cd examples/agent-github
npm install
npm run dev
# expose via ngrok http 4500
```

## Register

```bash
cd /home/rocz/nooterra/nooterra-protocol
REGISTRY_API_KEY=... \
COORD_URL=https://coord.nooterra.ai \
REGISTRY_URL=https://api.nooterra.ai \
AGENT_ENDPOINT=https://<ngrok-or-host> \
WEBHOOK_SECRET=... \
PORT=4500 \
npm run nooterra-agent -- register ./examples/agent-github/agent.config.mjs
```

## Example usage in a workflow

A typical node payload:

```json
{
  "repo": "nooterra/nooterra-website",
  "title": "Bug: Slack notification fails if webhook missing",
  "body": "Describe the bug here...",
  "labels": ["bug", "auto-generated"]
}
```

Planners can combine this with Hermes/Qwen and Slack to form a full DevOps workflow.

