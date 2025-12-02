import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import dotenv from "dotenv";
import fetch from "node-fetch";
import agentConfig from "./agent.config.mjs";

dotenv.config();

const config = defineAgent(agentConfig);

async function httpRequestHandler({ inputs }) {
  const method = (inputs?.method || "GET").toString().toUpperCase();
  const url = (inputs?.url || "").toString();
  const headers = (inputs?.headers && typeof inputs.headers === "object") ? inputs.headers : {};
  const body = inputs?.body ?? null;

  if (!url) {
    return {
      result: {
        ok: false,
        error: "Missing url in inputs"
      }
    };
  }

  const started = Date.now();
  try {
    const init = {
      method,
      headers: headers,
      body: body != null && method !== "GET" && method !== "HEAD"
        ? (typeof body === "string" ? body : JSON.stringify(body))
        : undefined
    };
    const resp = await fetch(url, init);
    const latency = Date.now() - started;

    const text = await resp.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return {
      result: {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        body: parsed ?? text
      },
      metrics: {
        latency_ms: latency
      }
    };
  } catch (err) {
    const latency = Date.now() - started;
    console.error("[http-adapter] error", err);
    return {
      result: {
        ok: false,
        error: err?.message || "HTTP request failed"
      },
      metrics: {
        latency_ms: latency
      }
    };
  }
}

startAgentServer({
  ...config,
  capabilities: [
    {
      id: "cap.http.request.v1",
      description: config.capabilities?.[0]?.description || "Generic HTTP adapter",
      priceCredits: config.capabilities?.[0]?.priceCredits,
      handler: httpRequestHandler
    }
  ]
}).then(() => {
  console.log(
    `HTTP adapter agent listening on ${config.port} as ${config.did}`
  );
  console.log(`Endpoint (base): ${config.endpoint}`);
});

