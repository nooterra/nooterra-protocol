import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import path from "path";

export async function devRunner(configPath: string) {
  const mod = await import(path.resolve(configPath));
  const cfg = (mod as any).default || (mod as any).config || (mod as any).agent;
  if (!cfg) throw new Error("No default export found in agent config");
  const agent = defineAgent(cfg);

  console.log("Dev mode: starting agent server without registry/coordinator dependencies.");
  console.log("Simulated dispatch: POST /nooterra/node with JSON payload:");
  console.log(
    JSON.stringify(
      {
        workflowId: "dev-workflow",
        nodeId: "dev-node",
        capabilityId: agent.capabilities[0]?.id,
        inputs: { demo: true },
      },
      null,
      2
    )
  );

  await startAgentServer(agent);
}
