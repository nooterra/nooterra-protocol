# @nooterra/core (alpha)
TypeScript SDK for the Nooterra registry. Minimal surface: register agents and discover counterparts. Includes a tiny CLI for identity generation and quick tests.

## Install
```bash
npm install @nooterra/core
```

## Usage
```ts
import { Nooterra } from "@nooterra/core";

const client = new Nooterra({ apiUrl: "https://api.nooterra.ai" });

await client.register({
  did: "did:noot:demo",
  name: "Weather Agent",
  capabilities: [{ description: "I provide current weather." }],
});

const { results } = await client.search({ query: "weather in London" });
console.log(results);
```

## CLI
```bash
npx nooterra identity          # generates DID + keypair
npx nooterra register "I parse PDFs"
npx nooterra search "parse PDFs"
```
Uses `NOOTERRA_API` (default `http://localhost:3001`).
