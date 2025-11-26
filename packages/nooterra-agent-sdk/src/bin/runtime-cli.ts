#!/usr/bin/env node
import { runFromConfig } from "../runtime.js";

const configPath = process.argv[2] || "./agent.config.mjs";

runFromConfig(configPath).catch((err) => {
  console.error("Agent runtime error:", err);
  process.exit(1);
});
