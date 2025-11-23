import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { simulateIoT } from "./simulate_iot.js";
import { logEvent, newIds } from "../utils/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AgentCap = { id: string; description: string; price: number; eta?: number; rep?: number };
type Candidate = AgentCap & { agentDid: string };

const REGISTRY_URL = process.env.REGISTRY_URL || "https://api.nooterra.ai";
const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY;
const OFFLINE = process.env.NOOTERRA_OFFLINE === "1";

async function maybeRegisterAgent(agent: { did: string; name: string; capability: string }) {
  if (OFFLINE) return;
  try {
    const res = await fetch(`${REGISTRY_URL}/v1/agent/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(REGISTRY_API_KEY ? { "x-api-key": REGISTRY_API_KEY } : {}),
      },
      body: JSON.stringify({
        did: agent.did,
        name: agent.name,
        capabilities: [{ description: agent.capability }],
      }),
    });
    if (!res.ok) throw new Error(`register failed ${res.status}`);
    logEvent({ agent: agent.name, phase: "REGISTER", ...newIds() }, "Registered with registry");
  } catch (err: any) {
    logEvent({ agent: agent.name, phase: "REGISTER" }, "Registry call failed; continuing offline", {
      error: err.message,
    });
  }
}

function loadWarehouses(): Candidate[] {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/warehouse_inventory.json"), "utf-8")
  ) as any[];
  return data.map((w) => ({
    id: w.id,
    agentDid: `did:noot:${w.id}`,
    description: w.name,
    price: w.price_usd,
    eta: w.eta_min,
    rep: Math.random() * 0.2 + 0.8,
  }));
}

function selectBid(candidates: Candidate[]) {
  return candidates
    .map((c) => {
      const score = (1 / (c.price + 1)) * 0.6 + (1 / ((c.eta ?? 60) + 1)) * 0.3 + (c.rep ?? 0) * 0.1;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score)[0];
}

async function main() {
  console.log("\n=== Cold-Chain Crisis Response Demo ===\n");

  // IoT anomaly detection
  const { shouldPublish, risk } = simulateIoT();
  if (!shouldPublish) {
    console.log("No anomaly detected; exiting.");
    return;
  }

  const trace = newIds();
  logEvent(
    { ...trace, agent: "ColdChainMonitor", phase: "PUBLISH" },
    "Publishing rescue intent",
    { intent: "Find cold storage within 40 miles, ETA < 60m, price < $500", spoilage_risk: risk }
  );

  // Register demo agents (best-effort)
  await maybeRegisterAgent({
    did: "did:noot:cold-storage-finder",
    name: "ColdStorageFinderAI",
    capability: "Lookup warehouse availability, pricing, intake policies for cold storage.",
  });
  await maybeRegisterAgent({
    did: "did:noot:geolocator",
    name: "GeoLocator Pro",
    capability: "Compute ETA matrix for candidate facilities using traffic & routing APIs.",
  });
  await maybeRegisterAgent({
    did: "did:noot:orchestrator",
    name: "LogisticsOrchestrator",
    capability: "Decompose cold-chain rescue tasks, build DAG, recruit coalition, execute rerouting.",
  });

  // Discovery (mocked list here)
  const warehouses = loadWarehouses();
  logEvent(
    { ...trace, agent: "SDN", phase: "DISCOVER" },
    "Discovered cold storage candidates",
    { count: warehouses.length }
  );

  // Recruitment (bidding)
  warehouses.forEach((w) =>
    logEvent(
      { ...trace, agent: w.agentDid, phase: "RECRUIT" },
      "Bid received",
      { amount_usd: w.price, eta_min: w.eta, reputation: w.rep?.toFixed(2) }
    )
  );
  const winner = selectBid(warehouses);
  logEvent(
    { ...trace, agent: "LogisticsOrchestrator", phase: "RECRUIT" },
    "Winner selected",
    { agentDid: winner.agentDid, price: winner.price, eta: winner.eta }
  );

  // DAG execution (simulated)
  const spans = [
    { name: "Compute ETA matrix", agent: "GeoLocator Pro" },
    { name: "Verify availability", agent: winner.description },
    { name: "Trigger reroute API", agent: "LogisticsOrchestrator" },
    { name: "Reserve warehouse slot", agent: winner.description },
  ];
  spans.forEach((s) =>
    logEvent(
      { ...trace, agent: s.agent, phase: "EXECUTE", spanId: randomUUID().slice(0, 16) },
      s.name
    )
  );

  // Settlement (simulated)
  logEvent(
    { ...trace, agent: "Settlement", phase: "SETTLE" },
    "Payments executed",
    {
      tx: `0x${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      payouts: [
        { agent: winner.agentDid, amount: winner.price },
        { agent: "GeoLocator Pro", amount: 0.5 },
        { agent: "LogisticsOrchestrator", amount: 3.0 },
      ],
    }
  );

  logEvent(
    { ...trace, agent: "ColdChainMonitor", phase: "FEEDBACK" },
    "Spoilage risk reduced",
    { from: `${risk.toFixed(1)}%`, to: "2%" }
  );

  console.log("\nDemo complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
