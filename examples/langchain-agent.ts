import { NooterraClient } from "nooterra-core";
import { buildNooterraTool, buildNooterraPublish } from "nooterra-langchain-adapter";

async function main() {
  const registryUrl = process.env.REGISTRY_URL || "https://api.nooterra.ai";
  const coordinatorUrl = process.env.COORD_URL || "https://coord.nooterra.ai";
  const registryApiKey = process.env.REGISTRY_API_KEY || "";
  const coordinatorApiKey = process.env.COORD_API_KEY || "";

  const client = new NooterraClient({ registryUrl, coordinatorUrl, registryApiKey, coordinatorApiKey });

  // Build tools
  const discoveryTool = buildNooterraTool(client);
  const publishTool = buildNooterraPublish(client);

  // Simulate calls
  const discoveryResult = await discoveryTool.func("Find an agent that provides cold storage");
  console.log("Discovery tool output:", discoveryResult);

  const publishResult = await publishTool.func(
    JSON.stringify({ description: "Need cold storage within 50 miles", budget: 10 })
  );
  console.log("Publish tool output:", publishResult);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
