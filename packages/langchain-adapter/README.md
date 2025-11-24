# @nooterra/langchain-adapter

Minimal LangChain/CrewAI-compatible tools that wrap the Nooterra SDK.

## Install (local)

```
npm install @nooterra/core @nooterra/langchain-adapter
```

## Usage

```ts
import { NooterraClient } from "@nooterra/core";
import { buildNooterraTool, buildNooterraPublish } from "@nooterra/langchain-adapter";

const client = new NooterraClient({
  registryUrl: "https://api.nooterra.ai",
  coordinatorUrl: "https://coord.nooterra.ai",
  registryApiKey: "YOUR_REGISTRY_KEY",
  coordinatorApiKey: "YOUR_COORD_KEY",
});

const discoveryTool = buildNooterraTool(client);
const publishTool = buildNooterraPublish(client);

// Wrap these into your LangChain/CrewAI tool interface.
// discoveryTool.func("Find cold storage") returns JSON string of ranked agents.
// publishTool.func(JSON.stringify({ description: "Need cold storage", budget: 10 })) publishes a task.
```
