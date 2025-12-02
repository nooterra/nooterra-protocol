import { defineAgent, startAgentServer } from "@nooterra/agent-sdk";
import dotenv from "dotenv";
import fetch from "node-fetch";
import agentConfig from "./agent.config.mjs";

dotenv.config();

const config = defineAgent(agentConfig);

async function createIssueHandler({ inputs }) {
  const repo = (inputs?.repo || process.env.GITHUB_REPO || "").toString();
  const title = (inputs?.title || "").toString();
  const body = (inputs?.body || "").toString();
  const labels = Array.isArray(inputs?.labels)
    ? inputs.labels.filter((l) => typeof l === "string")
    : [];
  const token =
    (inputs?.token && inputs.token.toString()) || process.env.GITHUB_TOKEN || "";

  if (!repo || !title) {
    return {
      result: {
        ok: false,
        error: "Missing repo or title in inputs"
      }
    };
  }
  if (!token) {
    return {
      result: {
        ok: false,
        error: "Missing GitHub token in inputs or GITHUB_TOKEN env"
      }
    };
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return {
      result: {
        ok: false,
        error: "repo must be of form owner/name"
      }
    };
  }

  const url = `https://api.github.com/repos/${owner}/${name}/issues`;
  const payload = {
    title,
    body,
    labels
  };

  const started = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "nooterra-agent-github"
      },
      body: JSON.stringify(payload)
    });
    const latency = Date.now() - started;
    const text = await resp.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      return {
        result: {
          ok: false,
          status: resp.status,
          error:
            (parsed && parsed.message) ||
            `GitHub API error ${resp.status}: ${text}`
        },
        metrics: { latency_ms: latency }
      };
    }

    const issue = parsed || {};
    return {
      result: {
        ok: true,
        issue_number: issue.number,
        html_url: issue.html_url,
        repository: repo,
        raw: issue
      },
      metrics: { latency_ms: latency }
    };
  } catch (err) {
    const latency = Date.now() - started;
    console.error("[github-agent] error", err);
    return {
      result: {
        ok: false,
        error: err?.message || "GitHub create issue failed"
      },
      metrics: { latency_ms: latency }
    };
  }
}

startAgentServer({
  ...config,
  capabilities: [
    {
      id: "cap.github.create_issue.v1",
      description:
        config.capabilities?.[0]?.description ||
        "Create a GitHub issue given repo, title, body, labels",
      priceCredits: config.capabilities?.[0]?.priceCredits,
      handler: createIssueHandler
    }
  ]
}).then(() => {
  console.log(
    `GitHub agent listening on ${config.port} as ${config.did}`
  );
  console.log(`Endpoint (base): ${config.endpoint}`);
});

