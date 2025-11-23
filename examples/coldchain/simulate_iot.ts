import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { newIds, logEvent } from "../utils/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function simulateIoT() {
  const telemetry = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/mock_telemetry.json"), "utf-8")
  ) as { timestamp: string; temp_c: number }[];

  const ids = newIds();
  const threshold = 8.0;
  const events: { ts: string; temp: number; alert: boolean; risk: number }[] = [];

  telemetry.forEach((row) => {
    const alert = row.temp_c > threshold;
    const risk = Math.min(100, Math.max(0, (row.temp_c - threshold) * 12));
    events.push({ ts: row.timestamp, temp: row.temp_c, alert, risk });
    logEvent(
      { ...ids, agent: "ColdChainMonitor", phase: "SENSE" },
      alert ? "Temperature anomaly detected" : "Temperature OK",
      { temp_c: row.temp_c, spoilage_risk: `${risk.toFixed(1)}%` }
    );
  });

  const last = events[events.length - 1];
  const shouldPublish = last.alert && last.risk > 50;
  return { shouldPublish, risk: last.risk, ids };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  simulateIoT();
}
