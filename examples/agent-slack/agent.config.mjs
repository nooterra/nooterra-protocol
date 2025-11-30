import { defineAgent } from "@nooterra/agent-sdk";

export default defineAgent({
  did: "did:noot:example:slack-notify",
  registryUrl: process.env.REGISTRY_URL || "https://api.nooterra.ai",
  coordinatorUrl: process.env.COORD_URL || "https://coord.nooterra.ai",
  // Public base URL (no trailing slash); SDK appends `/nooterra/node` on register.
  endpoint: process.env.AGENT_ENDPOINT || "http://localhost:4000",
  privateKey: process.env.PRIVATE_KEY || "",
  publicKey: process.env.PUBLIC_KEY || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  port: Number(process.env.PORT || 4000),
  hooks: {
    onDispatch: (d) => console.log("[hook] dispatch", d.capabilityId, d.workflowId, d.nodeId),
    onResult: (r) => console.log("[hook] result", r.capabilityId, r.workflowId),
    onError: (e) => console.warn("[hook] error", e.capabilityId, e.error?.message || e.error),
    onHeartbeat: (h) => {
      if (!h.ok) console.warn("[hook] heartbeat failed", h.error);
    },
  },
  capabilities: [
    {
      id: "cap.slack.notify.v1",
      description: "Post a message to a Slack channel via webhook",
      priceCredits: 5,
      handler: async ({ inputs, workflowId, nodeId, capabilityId }) => {
        console.log("[slack-agent] dispatch", {
          workflowId,
          nodeId,
          capabilityId,
          hasWebhookUrl: !!inputs?.webhookUrl,
        });
        const { webhookUrl, text } = inputs || {};

        if (!webhookUrl || !text) {
          return {
            result: {
              ok: false,
              error: "Missing webhookUrl or text in inputs",
            },
          };
        }

        const started = Date.now();

        try {
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });

          const latency = Date.now() - started;

          if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            console.error("Slack webhook error", resp.status, body);
            return {
              result: {
                ok: false,
                error: `Slack webhook returned ${resp.status}`,
              },
              metrics: {
                latency_ms: latency,
                http_status: resp.status,
              },
            };
          }

          return {
            result: {
              ok: true,
              data: { delivered: true },
            },
            metrics: {
              latency_ms: latency,
            },
          };
        } catch (err) {
          const latency = Date.now() - started;
          console.error("Slack webhook request failed", err);
          return {
            result: {
              ok: false,
              error: "Slack webhook request failed",
            },
            metrics: {
              latency_ms: latency,
            },
          };
        }
      },
    },
  ],
});
