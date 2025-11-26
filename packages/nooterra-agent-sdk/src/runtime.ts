import path from "path";
import { defineAgent } from "./index.js";
import { startAgentServer } from "./server.js";

export async function runFromConfig(configPath: string): Promise<void> {
  const resolved = path.resolve(configPath);
  const mod = await import(resolved);
  const agentCfg = (mod as any).default || (mod as any).config || (mod as any).agent;
  if (!agentCfg) {
    throw new Error("No default export found in agent config");
  }
  const cfg = defineAgent(agentCfg);
  await startAgentServer(cfg);
}
