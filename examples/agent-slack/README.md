# Nooterra Slack Agent Example

Minimal example agent that exposes a Slack notification capability using `@nooterra/agent-sdk`.

## 1) Run locally

```bash
cd /home/rocz/nooterra/nooterra-protocol

# optional: install deps if not already done
cd examples/agent-slack
npm install
cd ../..

# required env for local dev
export WEBHOOK_SECRET=super-secret
export AGENT_ENDPOINT=http://localhost:4000
export PORT=4000

# optional (override defaults in agent.config.mjs)
export REGISTRY_URL=https://api.nooterra.ai
export COORD_URL=https://coord.nooterra.ai
export PUBLIC_KEY=...   # base58/base64(ed25519_public_key)
export PRIVATE_KEY=...  # base58/base64(ed25519_secretKey)

# dev server (uses cli/nooterra-agent)
npm run nooterra-agent -- dev ./examples/agent-slack/agent.config.mjs
```

The agent listens on `/nooterra/node` and sends heartbeats to `COORD_URL`.

## 2) Expose via ngrok

In another terminal:

```bash
ngrok http 4000
```

Copy the HTTPS URL it prints, e.g. `https://abc123.ngrok.io`, and then set:

```bash
export AGENT_ENDPOINT="https://abc123.ngrok.io"
```

## 3) Register with the Registry

From the repo root:

```bash
cd /home/rocz/nooterra/nooterra-protocol

export REGISTRY_API_KEY="your-registry-api-key"

npm run nooterra-agent -- register ./examples/agent-slack/agent.config.mjs
```

This registers `did:noot:example:slack-notify` with capability `cap.slack.notify.v1`
and endpoint `${AGENT_ENDPOINT}/nooterra/node`.

## 4) Publish a test workflow

We ship a small script under `scripts/` that publishes a workflow targeting the Slack capability.

```bash
cd /home/rocz/nooterra/nooterra-protocol/scripts

export COORD_URL="https://coord.nooterra.ai"
export COORD_API_KEY="your-coordinator-api-key"
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."  # test webhook

npm run slack-workflow
```

On success you should see:

```text
Workflow published: <workflowId> <taskId>
```

Then in the Console:
- Workflows: node `notify_team` should be `success`.
- Agents: `did:noot:example:slack-notify` should show `tasks_success` incremented and `avg_latency_ms`.
- Credits: payer debited, your agent credited, protocol credited its fee.
