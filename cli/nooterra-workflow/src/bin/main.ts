#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { publishWorkflow } from "@nooterra/agent-sdk";

type WorkflowDef = {
  intent?: string;
  payerDid?: string;
  maxCents?: number;
  nodes: Record<
    string,
    {
      capabilityId: string;
      dependsOn?: string[];
      payload?: any;
      requires_verification?: boolean;
    }
  >;
};

async function loadManifest(manifestPath: string): Promise<WorkflowDef> {
  const abs = path.resolve(manifestPath);
  const text = await fs.readFile(abs, "utf8");
  const def = JSON.parse(text);
  if (!def || typeof def !== "object" || !def.nodes) {
    throw new Error("Invalid manifest: missing top-level 'nodes' field");
  }
  return substituteEnv(def);
}

function substituteEnv(obj: any): any {
  if (obj == null || typeof obj !== "object") {
    if (typeof obj === "string") {
      const m = obj.match(/^\$\{ENV:([A-Z0-9_]+)\}$/);
      if (m) {
        const v = process.env[m[1]];
        if (v == null) {
          throw new Error(`ENV var ${m[1]} not set for manifest substitution`);
        }
        return v;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => substituteEnv(v));
  }
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = substituteEnv(v);
  }
  return out;
}

async function cmdPublish(manifestPath: string) {
  const coordUrl =
    process.env.COORD_URL || process.env.COORDINATOR_URL || "https://coord.nooterra.ai";
  const apiKey =
    process.env.COORD_API_KEY ||
    process.env.COORDINATOR_API_KEY ||
    process.env.NOOTERRA_API_KEY ||
    "";
  if (!apiKey) {
    throw new Error(
      "Missing API key. Set COORD_API_KEY, COORDINATOR_API_KEY, or NOOTERRA_API_KEY."
    );
  }
  const def = await loadManifest(manifestPath);
  const { workflowId, taskId } = await publishWorkflow(coordUrl, apiKey, def as any);
  console.log("Workflow published:");
  console.log("  workflowId:", workflowId);
  console.log("  taskId    :", taskId);
}

async function main() {
  const [, , cmd, maybePath] = process.argv;

  try {
    switch (cmd) {
      case "publish": {
        const manifestPath = maybePath || "examples/workflows/hello-world.json";
        await cmdPublish(manifestPath);
        break;
      }
      default:
        console.log(`Usage:
  nooterra-workflow publish <manifestPath>

Environment:
  COORD_URL / COORDINATOR_URL   Coordinator base URL (default: https://coord.nooterra.ai)
  COORD_API_KEY / COORDINATOR_API_KEY / NOOTERRA_API_KEY  API key for coordinator

Manifest:
  JSON file with shape:
  {
    "intent": "...",
    "payerDid": "did:noot:demo:payer",
    "maxCents": 1000,
    "nodes": {
      "node_name": {
        "capabilityId": "cap.some.id",
        "dependsOn": ["other_node"],
        "payload": { ... }
      }
    }
  }

In payload strings, you can use \${ENV:VAR_NAME} to substitute process.env.VAR_NAME.
`);
        process.exit(cmd ? 1 : 0);
    }
  } catch (err: any) {
    console.error("Error:", err?.message || err);
    process.exit(1);
  }
}

main();

