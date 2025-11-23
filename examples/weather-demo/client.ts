import { Nooterra } from "../../sdk/typescript/src/index.js";

const REGISTRY = process.env.NOOTERRA_API || "http://localhost:3001";

async function main() {
  const client = new Nooterra({ apiUrl: REGISTRY });
  const { results } = await client.search({ query: "weather in London", limit: 3 });
  if (!results.length) {
    console.log("No agents found.");
    return;
  }

  const top = results[0];
  console.log("Found agent:", top.agentDid, "endpoint:", top.agent?.endpoint);

  if (top.agent?.endpoint) {
    const res = await fetch(`${top.agent.endpoint}/weather?city=London`);
    const json = await res.json();
    console.log("Weather response:", json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
