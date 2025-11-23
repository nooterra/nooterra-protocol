import { randomBytes, generateKeyPairSync, createPublicKey } from "crypto";
import { z } from "zod";

export type CapabilityInput = {
  description: string;
  capabilityId?: string;
  tags?: string[];
};

export type RegisterRequest = {
  did: string;
  name?: string;
  endpoint?: string;
  capabilities: CapabilityInput[];
};

export type RegisterResponse = {
  ok: boolean;
  registered: number;
};

export type SearchRequest = {
  query: string;
  limit?: number;
};

export type SearchResult = {
  score: number;
  agentDid?: string;
  capabilityId?: string;
  description?: string;
  tags?: string[];
  agent?: {
    did: string;
    name: string | null;
    endpoint: string | null;
  } | null;
};

const registerSchema = z.object({
  did: z.string(),
  name: z.string().optional(),
  endpoint: z.string().optional(),
  capabilities: z.array(
    z.object({
      description: z.string(),
      capabilityId: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
  ),
});

const searchSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

export class Nooterra {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config: { apiUrl?: string; apiKey?: string } = {}) {
    this.apiUrl = config.apiUrl || "https://api.nooterra.ai";
    this.apiKey = config.apiKey;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async register(req: RegisterRequest): Promise<RegisterResponse> {
    const payload = registerSchema.parse(req);
    return this.post<RegisterResponse>("/v1/agent/register", payload);
  }

  async search(req: SearchRequest): Promise<{ results: SearchResult[] }> {
    const payload = searchSchema.parse(req);
    return this.post<{ results: SearchResult[] }>("/v1/agent/discovery", payload);
  }
}

export function generateIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const did = `did:noot:${publicDer.toString("base64url")}`;
  return {
    did,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
