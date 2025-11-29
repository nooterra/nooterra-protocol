import fetch from "node-fetch";
import type { WorkflowDef } from "./types.js";
import { WorkflowPublishError } from "./errors.js";

function validateWorkflow(def: WorkflowDef) {
  const nodes = Object.keys(def.nodes || {});
  for (const [name, node] of Object.entries(def.nodes || {})) {
    for (const dep of node.dependsOn || []) {
      if (!nodes.includes(dep)) {
        throw new Error(`Node "${name}" depends on missing node "${dep}"`);
      }
    }
  }
  // simple cycle guard: depth-limited DFS
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (n: string) => {
    if (visiting.has(n)) throw new Error(`Cycle detected at node "${n}"`);
    if (visited.has(n)) return;
    visiting.add(n);
    for (const dep of def.nodes[n].dependsOn || []) dfs(dep);
    visiting.delete(n);
    visited.add(n);
  };
  for (const n of nodes) dfs(n);
}

export async function publishWorkflow(
  coordUrl: string,
  apiKey: string,
  def: WorkflowDef
): Promise<{ workflowId: string; taskId: string }> {
  validateWorkflow(def);
  const res = await fetch(`${coordUrl}/v1/workflows/publish`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(def),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new WorkflowPublishError(res.status, text);
  }
  const data: any = await res.json();
  return { workflowId: data.workflowId, taskId: data.taskId };
}
