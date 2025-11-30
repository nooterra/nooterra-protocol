import agentConfig from "./agent.config.mjs";
import { startAgentServer } from "@nooterra/agent-sdk";

startAgentServer(agentConfig).then(() => {
  console.log(`Slack agent listening on ${agentConfig.port} as ${agentConfig.did}`);
  console.log(`Endpoint (base): ${agentConfig.endpoint}`);
});
