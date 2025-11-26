import { AgentConfig, WorkflowDef } from "./types.js";
import { startAgentServer } from "./server.js";
import { registerAgent } from "./register.js";
import { publishWorkflow } from "./workflow.js";

export * from "./types.js";
export { startAgentServer, registerAgent, publishWorkflow };

export function defineAgent(config: AgentConfig): AgentConfig {
  // Basic shape guard; deeper validation can be added later
  if (!config.did) throw new Error("AgentConfig.did is required");
  if (!config.registryUrl) throw new Error("AgentConfig.registryUrl is required");
  if (!config.coordinatorUrl) throw new Error("AgentConfig.coordinatorUrl is required");
  if (!config.webhookSecret) throw new Error("AgentConfig.webhookSecret is required");
  if (!config.endpoint) throw new Error("AgentConfig.endpoint is required (public base URL)");
  if (!config.capabilities || config.capabilities.length === 0) {
    throw new Error("AgentConfig.capabilities must include at least one capability");
  }
  return config;
}

export { runFromConfig } from "./runtime.js";
export type { AgentConfig, WorkflowDef };
