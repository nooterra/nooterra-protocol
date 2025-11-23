import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { logEvent, newIds } from "../utils/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Item = { id: string; price: number; [k: string]: any };

function load<T = Item>(p: string): T[] {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "data", p), "utf-8"));
}

function cartesian<T>(...arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>((acc, arr) => {
    if (!acc.length) return arr.map((x) => [x]);
    return acc.flatMap((prefix) => arr.map((x) => [...prefix, x]));
  }, []);
}

function carbonScore(flight: any, hotel: any, experience: any, dining: any) {
  const base = flight.co2_kg || 0;
  const stay = (hotel.safety || 0.9) * 50;
  const local = 30;
  const total = base + stay + local;
  return { total, label: total < 950 ? "green" : "standard" };
}

async function main() {
  console.log("\n=== Travel Coalition Demo ===\n");
  const trace = newIds();

  const flights = load("flights.json");
  const hotels = load("hotels.json");
  const dining = load("restaurants.json");
  const experiences = load("experiences.json");

  logEvent({ ...trace, agent: "TravelOrchestrator", phase: "DISCOVER" }, "Loaded datasets", {
    flights: flights.length,
    hotels: hotels.length,
    dining: dining.length,
    experiences: experiences.length,
  });

  // Build candidate bundles (limited)
  const bundles = cartesian(flights, hotels, dining.slice(0, 2), experiences.slice(0, 2))
    .slice(0, 6)
    .map((combo) => {
      const [f, h, d, x] = combo as any[];
      const price = f.price + h.price * 6 + d.price * 2 + x.price;
      const carbon = carbonScore(f, h, x, d);
      return {
        id: randomUUID().slice(0, 8),
        flight: f,
        hotel: h,
        dining: d,
        experience: x,
        price,
        carbon,
        score: 1 / price + (carbon.label === "green" ? 0.1 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  bundles.forEach((b, idx) =>
    logEvent(
      { ...trace, agent: "TravelOrchestrator", phase: "BUNDLE" },
      `Bundle ${idx + 1} composed`,
      {
        price: b.price,
        carbon: b.carbon,
        flight: b.flight.route,
        hotel: b.hotel.name,
        dining: b.dining.name,
        experience: b.experience.name,
      }
    )
  );

  logEvent(
    { ...trace, agent: "TravelOrchestrator", phase: "SETTLE" },
    "Simulated settlement across agents",
    {
      payouts: bundles[0]
        ? [
            { agent: "FlightAgent", amount: bundles[0].flight.price },
            { agent: "HotelAgent", amount: bundles[0].hotel.price * 6 },
            { agent: "DiningAgent", amount: bundles[0].dining.price * 2 },
            { agent: "ExperienceAgent", amount: bundles[0].experience.price },
            { agent: "CarbonOptimizer", amount: 0.75 },
          ]
        : [],
    }
  );

  console.log("\nTop bundles:");
  bundles.forEach((b, idx) =>
    console.log(
      `#${idx + 1} $${b.price.toFixed(0)} | ${b.flight.route} + ${b.hotel.name} + ${b.dining.name} + ${b.experience.name} | CO2=${b.carbon.total.toFixed(0)}kg`
    )
  );

  console.log("\nDemo complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
