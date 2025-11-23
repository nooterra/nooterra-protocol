import Fastify from "fastify";
import { Nooterra, generateIdentity } from "../../sdk/typescript/src/index.js";

const PORT = 4000;
const REGISTRY = process.env.NOOTERRA_API || "http://localhost:3001";

async function main() {
  const id = generateIdentity();
  const app = Fastify();

  app.get("/weather", async (req: any, reply) => {
    const city = (req.query.city as string) || "Unknown";
    return { city, tempC: 21.5, condition: "Partly Cloudy" };
  });

  await app.listen({ port: PORT });
  console.log(`Provider listening on ${PORT}`);

  const client = new Nooterra({ apiUrl: REGISTRY });
  await client.register({
    did: id.did,
    name: "Weather Agent",
    endpoint: `http://localhost:${PORT}`,
    capabilities: [{ description: "I provide current weather by city name." }],
  });

  console.log("Registered provider DID:", id.did);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
