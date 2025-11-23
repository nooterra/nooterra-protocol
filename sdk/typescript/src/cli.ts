#!/usr/bin/env node
import { Nooterra, generateIdentity } from "./index.js";

const args = process.argv.slice(2);
const [command, ...rest] = args;

function printHelp() {
  console.log(`nooterra CLI
Usage:
  nooterra identity           Generate a DID + keypair
  nooterra register <desc>    Register a demo agent with one capability description
  nooterra search <query>     Search for agents by intent
Environment:
  NOOTERRA_API (default https://api.nooterra.ai)
`);
}

async function main() {
  const apiUrl = process.env.NOOTERRA_API || "https://api.nooterra.ai";
  const client = new Nooterra({ apiUrl });

  try {
    if (!command || command === "help" || command === "--help") {
      printHelp();
      return;
    }

    if (command === "identity") {
      const id = generateIdentity();
      console.log(JSON.stringify(id, null, 2));
      return;
    }

    if (command === "register") {
      const desc = rest.join(" ");
      if (!desc) throw new Error("Please provide a capability description.");
      const id = generateIdentity();
      const res = await client.register({
        did: id.did,
        name: "Demo Agent",
        capabilities: [{ description: desc }],
      });
      console.log("Registered:", res);
      console.log("DID:", id.did);
      return;
    }

    if (command === "search") {
      const query = rest.join(" ");
      if (!query) throw new Error("Please provide a query.");
      const res = await client.search({ query });
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    printHelp();
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}

main();
