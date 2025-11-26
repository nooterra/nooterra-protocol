#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { defineAgent, startAgentServer, registerAgent } from "@nooterra/agent-sdk";
import { devRunner } from "../dev-runner.js";

async function loadConfig(configPath: string) {
  const mod = await import(path.resolve(configPath));
  const cfg = (mod as any).default || (mod as any).config || (mod as any).agent;
  if (!cfg) throw new Error("No default export found in agent config");
  return defineAgent(cfg);
}

async function cmdInit(configPath: string) {
  const exists = await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    console.log(`Config already exists at ${configPath}, skipping.`);
    return;
  }
  const tpl = `import { defineAgent } from "@nooterra/agent-sdk";

export default defineAgent({
  did: "did:noot:YOUR_AGENT_DID",
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  endpoint: "http://localhost:3000", // replace with your public base URL; SDK appends /nooterra/node
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me",
  port: Number(process.env.PORT || 3000),
  capabilities: [
    {
      id: "cap.demo.hello.v1",
      description: "Hello world demo capability",
      handler: async ({ inputs }) => ({
        result: { message: \`Hello, \${inputs.name || "world"}!\` },
        metrics: { latency_ms: 50 }
      })
    }
  ]
});
`;
  await fs.writeFile(configPath, tpl, "utf8");
  console.log(`Created ${configPath}`);
}

async function cmdDev(configPath: string) {
  const cfg = await loadConfig(configPath);
  await startAgentServer(cfg);
}

async function cmdRegister(configPath: string) {
  const cfg = await loadConfig(configPath);
  await registerAgent(cfg);
  console.log(`Registered agent ${cfg.did}`);
  console.log(`Endpoint: ${cfg.endpoint}/nooterra/node`);
  console.log(`Capabilities: ${cfg.capabilities.map((c) => c.id).join(", ")}`);
  console.log("Next: publish a workflow targeting one of these capabilities.");
}

async function main() {
  const [, , cmd, maybePath] = process.argv;
  const configPath = maybePath || "./agent.config.mjs";

  try {
    switch (cmd) {
      case "init":
        await cmdInit(configPath);
        break;
      case "dev":
        await devRunner(configPath);
        break;
      case "register":
        await cmdRegister(configPath);
        break;
      default:
        console.log(`Usage:
  nooterra-agent init [configPath]
  nooterra-agent dev [configPath]
  nooterra-agent register [configPath]`);
        process.exit(cmd ? 1 : 0);
    }
  } catch (err: any) {
    console.error(`Error: ${err?.message || err}`);
    process.exit(1);
  }
}

main();
