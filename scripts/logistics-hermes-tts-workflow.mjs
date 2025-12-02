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
    intent: "logistics-hermes-tts-demo",
    payerDid: "did:noot:demo:payer",
    maxCents: 2000,
    nodes: {
      extract_manifest: {
        capabilityId: "cap.test.echo",
        payload: {
          container_id: "CNU1234567",
          origin: "Shanghai",
          destination: "Rotterdam",
          contents: ["electronics", "batteries"],
        },
      },
      weather_risk: {
        capabilityId: "cap.weather.noaa.v1",
        dependsOn: ["extract_manifest"],
      },
      customs_classify: {
        capabilityId: "cap.customs.classify.v1",
        dependsOn: ["extract_manifest"],
      },
      rail_optimize: {
        capabilityId: "cap.rail.optimize.v1",
        dependsOn: ["weather_risk", "customs_classify"],
      },
      hermes_summary: {
        capabilityId: "cap.llm.hermes.chat.v1",
        dependsOn: [
          "extract_manifest",
          "weather_risk",
          "customs_classify",
          "rail_optimize",
        ],
        payload: {
          prompt:
            "Summarize this shipment plan and its risks in 3–5 sentences, using the structured context provided.",
          max_tokens: 256,
        },
      },
      tts_readout: {
        capabilityId: "cap.tts.unclose.v1",
        dependsOn: ["hermes_summary"],
        payload: {
          textFromParentField: "hermes_summary.content",
          format: "mp3",
        },
      },
      notify_ops: {
        capabilityId: "cap.slack.notify.v1",
        dependsOn: ["hermes_summary"],
        payload: {
          webhookUrl: slackWebhookUrl,
          text:
            "Nooterra logistics + Hermes + TTS workflow completed. Summary:\\n" +
            "{{parents.hermes_summary.content}}",
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

