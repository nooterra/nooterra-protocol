import fetch from "node-fetch";
import type { AgentConfig } from "./types.js";
import { RegistrationFailedError } from "./errors.js";
import { signACARD, verifyACARD } from "./acard.js";
import bs58 from "bs58";

export async function registerAgent(config: AgentConfig): Promise<void> {
  const baseEndpoint = config.endpoint.replace(/\/$/, "");
  let signed: any = null;

  if (config.privateKey || config.publicKey) {
    if (!config.privateKey || !config.publicKey) {
      throw new RegistrationFailedError(400, "publicKey and privateKey required together for ACARD signing");
    }
    const card = {
      did: config.did,
      endpoint: baseEndpoint,
      publicKey: config.publicKey,
      version: 1,
      lineage: null,
      capabilities: config.capabilities.map((cap) => ({
        id: cap.id,
        description: cap.description,
        inputSchema: cap.inputSchema ?? null,
        outputSchema: cap.outputSchema ?? null,
      })),
      metadata: {},
    };
    const secret = bs58.decode(config.privateKey);
    const s = signACARD(card, secret);
    if (!verifyACARD(s)) {
      throw new RegistrationFailedError(400, "ACARD signature verification failed");
    }
    signed = s;
  }

  const endpoint = `${config.registryUrl}/v1/agent/register`;
  const body = {
    did: config.did,
    name: config.did,
    endpoint: `${baseEndpoint}/nooterra/node`,
    capabilities: config.capabilities.map((cap) => ({
      capability_id: cap.id,
      description: cap.description,
      input_schema: cap.inputSchema,
      output_schema: cap.outputSchema,
      pricing: cap.priceCredits ? { credits: cap.priceCredits } : undefined,
    })),
    acard: signed ? signed.card : undefined,
    acard_signature: signed ? signed.signature : undefined,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.API_KEY || process.env.REGISTRY_API_KEY || "",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new RegistrationFailedError(res.status, text);
  }
}
