import "dotenv/config";
import { publishWorkflow } from "@nooterra/agent-sdk";

async function main() {
  const coordUrl = process.env.COORD_URL || "https://coord.nooterra.ai";
  const apiKey = process.env.COORD_API_KEY || "";
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || "";

  if (!apiKey) {
    throw new Error("COORD_API_KEY is required");
  }
  if (!slackWebhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is required");
  }

  const def = {
    intent: "demo.slack.notify",
    payerDid: "did:noot:demo:payer",
    maxCents: 100,
    nodes: {
      notify_team: {
        capabilityId: "cap.slack.notify.v1",
        payload: {
          webhookUrl: slackWebhookUrl,
          text: "Hello from a Nooterra Slack agent! ✅",
        },
      },
    },
  };

  const { workflowId, taskId } = await publishWorkflow(coordUrl, apiKey, def);
  console.log("Workflow published:", workflowId, taskId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

