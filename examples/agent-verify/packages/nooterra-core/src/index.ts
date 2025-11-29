import fetch, { type Response } from "node-fetch";

export interface NooterraClientOptions {
  registryUrl: string;
  coordinatorUrl: string;
  registryApiKey?: string;
  coordinatorApiKey?: string;
}

export interface CapabilityInput {
  description: string;
  capabilityId?: string;
  tags?: string[];
}

export interface RegisterResponse {
  ok: boolean;
  registered: number;
}

export interface DiscoveryResult {
  score?: number;
  vectorScore?: number;
  reputationScore?: number;
  agentDid?: string;
  capabilityId?: string;
  description?: string;
  tags?: string[];
  reputation?: number | null;
  agent?: { did: string; name: string | null; endpoint: string | null; reputation: number | null } | null;
}

export interface PublishOptions {
  description: string;
  budget?: number;
  webhookUrl?: string;
  requirements?: Record<string, unknown>;
  deadline?: string;
}

export type NodeDef = {
  capabilityId: string;
  dependsOn?: string[];
  payload?: Record<string, any>;
};

export type WorkflowDef = {
  intent?: string;
  nodes: Record<string, NodeDef>;
};

export interface BidOptions {
  agentDid: string;
  amount?: number;
  etaMs?: number;
}

export interface FeedbackOptions {
  agentDid: string;
  rating: number;
  comment?: string;
}

export class NooterraError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export class NooterraClient {
  private registryUrl: string;
  private coordinatorUrl: string;
  private registryApiKey?: string;
  private coordinatorApiKey?: string;

  constructor(opts: NooterraClientOptions) {
    if (!opts.registryUrl || !opts.coordinatorUrl) {
      throw new Error("registryUrl and coordinatorUrl are required");
    }
    this.registryUrl = opts.registryUrl.replace(/\/+$/, "");
    this.coordinatorUrl = opts.coordinatorUrl.replace(/\/+$/, "");
    this.registryApiKey = opts.registryApiKey;
    this.coordinatorApiKey = opts.coordinatorApiKey;
  }

  private headers(apiKey?: string) {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  }

  private async handle(resp: Response) {
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new NooterraError(txt || resp.statusText, resp.status);
    }
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }

  async registerAgent(did: string, capabilities: CapabilityInput[], name?: string) {
    const body = { did, name, capabilities };
    const resp = await fetch(`${this.registryUrl}/v1/agent/register`, {
      method: "POST",
      headers: this.headers(this.registryApiKey),
      body: JSON.stringify(body),
    });
    return (await this.handle(resp)) as RegisterResponse;
  }

  async discovery(query: string, limit = 5) {
    const resp = await fetch(`${this.registryUrl}/v1/agent/discovery`, {
      method: "POST",
      headers: this.headers(this.registryApiKey),
      body: JSON.stringify({ query, limit }),
    });
    const json = await this.handle(resp);
    return (json as any)?.results as DiscoveryResult[];
  }

  async publishTask(opts: PublishOptions) {
    const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/publish`, {
      method: "POST",
      headers: this.headers(this.coordinatorApiKey),
      body: JSON.stringify(opts),
    });
    const json = await this.handle(resp);
    return (json as any)?.taskId as string;
  }

  async submitBid(taskId: string, opts: BidOptions) {
    const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/bid`, {
      method: "POST",
      headers: this.headers(this.coordinatorApiKey),
      body: JSON.stringify(opts),
    });
    return this.handle(resp);
  }

  async settle(taskId: string, payouts?: { agentDid: string; amount: number }[]) {
    const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/settle`, {
      method: "POST",
      headers: this.headers(this.coordinatorApiKey),
      body: JSON.stringify(payouts ? { payouts } : {}),
    });
    return this.handle(resp);
  }

  async feedback(taskId: string, opts: FeedbackOptions) {
    const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/feedback`, {
      method: "POST",
      headers: this.headers(this.coordinatorApiKey),
      body: JSON.stringify(opts),
    });
    return this.handle(resp);
  }

  async getFeedback(taskId: string) {
    const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/feedback`, {
      headers: this.headers(this.coordinatorApiKey),
    });
    return this.handle(resp);
  }

  async balances(agentDid: string) {
    const resp = await fetch(`${this.coordinatorUrl}/v1/balances/${agentDid}`, {
      headers: this.headers(this.coordinatorApiKey),
    });
    return this.handle(resp);
  }

  async ledger(agentDid: string, limit = 50) {
    const resp = await fetch(
      `${this.coordinatorUrl}/v1/ledger/${agentDid}/history?limit=${encodeURIComponent(limit)}`,
      {
        headers: this.headers(this.coordinatorApiKey),
      }
    );
    return this.handle(resp);
  }

  async workflow(def: WorkflowDef) {
    validateWorkflow(def);
    const resp = await fetch(`${this.coordinatorUrl}/v1/workflows/publish`, {
      method: "POST",
      headers: this.headers(this.coordinatorApiKey),
      body: JSON.stringify(def),
    });
    return this.handle(resp) as Promise<{ workflowId: string; taskId: string; nodes: string[] }>;
  }
}

function validateWorkflow(def: WorkflowDef) {
  const nodes = def.nodes || {};
  const names = Object.keys(nodes);
  for (const [name, node] of Object.entries(nodes)) {
    const deps = node.dependsOn || [];
    if (deps.includes(name)) throw new Error(`Node ${name} depends on itself`);
    deps.forEach((d) => {
      if (!names.includes(d)) throw new Error(`Node ${name} depends on missing node ${d}`);
    });
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (n: string): boolean => {
    if (visiting.has(n)) return true;
    if (visited.has(n)) return false;
    visiting.add(n);
    for (const d of nodes[n].dependsOn || []) {
      if (hasCycle(d)) return true;
    }
    visiting.delete(n);
    visited.add(n);
    return false;
  };
  for (const n of names) {
    if (hasCycle(n)) throw new Error("Cycle detected in workflow DAG");
  }
}
