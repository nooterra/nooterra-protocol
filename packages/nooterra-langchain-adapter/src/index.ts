import { NooterraClient, DiscoveryResult } from "nooterra-core";

type ToolCall = {
  name: string;
  description: string;
  func: (input: string) => Promise<string>;
};

/**
 * Build a minimal LangChain-style Tool that lets an agent call Nooterra discovery
 * and optionally publish tasks.
 *
 * This keeps dependencies light; you can wrap this object in your LangChain/CrewAI tool interface.
 */
export function buildNooterraTool(client: NooterraClient): ToolCall {
  return {
    name: "nooterra_discovery",
    description:
      "Search for autonomous agents by capability. Input: natural language intent. Output: ranked JSON of matching agents.",
    async func(input: string): Promise<string> {
      const results: DiscoveryResult[] = await client.discovery(input, 5);
      return JSON.stringify(results, null, 2);
    },
  };
}

/**
 * Helper to publish a task from an agentic workflow.
 */
export function buildNooterraPublish(client: NooterraClient): ToolCall {
  return {
    name: "nooterra_publish_task",
    description:
      "Publish a task to Nooterra. Input JSON: { description: string, budget?: number, webhookUrl?: string }",
    async func(input: string): Promise<string> {
      let body: any;
      try {
        body = JSON.parse(input);
      } catch {
        body = { description: input };
      }
      if (!body.description) {
        return "Error: description is required";
      }
      const taskId = await client.publishTask({
        description: body.description,
        budget: body.budget,
        webhookUrl: body.webhookUrl,
        requirements: body.requirements,
        deadline: body.deadline,
      });
      return JSON.stringify({ taskId });
    },
  };
}
