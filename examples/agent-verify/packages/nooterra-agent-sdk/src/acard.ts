import nacl from "tweetnacl";
import bs58 from "bs58";

export interface ACARDCapability {
  id: string;
  description: string;
  inputSchema?: any;
  outputSchema?: any;
  embeddingDim?: number;
}

export interface ACARD {
  did: string;
  endpoint: string;
  publicKey: string; // base58-encoded ed25519
  version: number;
  lineage?: string; // prior ACARD hash/version id
  capabilities: ACARDCapability[];
  metadata?: Record<string, any>;
}

export interface SignedACARD {
  card: ACARD;
  signature: string; // base58-encoded signature over canonical JSON
}

function canonicalize(card: ACARD): string {
  // Minimal canonical JSON: stable sort keys shallowly
  const ordered: any = {
    did: card.did,
    endpoint: card.endpoint,
    publicKey: card.publicKey,
    version: card.version,
    lineage: card.lineage ?? null,
    capabilities: card.capabilities.map((c) => ({
      id: c.id,
      description: c.description,
      inputSchema: c.inputSchema ?? null,
      outputSchema: c.outputSchema ?? null,
      embeddingDim: c.embeddingDim ?? null,
    })),
    metadata: card.metadata ?? null,
  };
  return JSON.stringify(ordered);
}

export function hashACARD(card: ACARD): Uint8Array {
  const data = new TextEncoder().encode(canonicalize(card));
  return nacl.hash(data);
}

export function signACARD(card: ACARD, secretKey: Uint8Array): SignedACARD {
  const payload = new TextEncoder().encode(canonicalize(card));
  const sig = nacl.sign.detached(payload, secretKey);
  return {
    card,
    signature: bs58.encode(sig),
  };
}

export function verifyACARD(signed: SignedACARD): boolean {
  try {
    const payload = new TextEncoder().encode(canonicalize(signed.card));
    const pub = bs58.decode(signed.card.publicKey);
    const sig = bs58.decode(signed.signature);
    return nacl.sign.detached.verify(payload, sig, pub);
  } catch {
    return false;
  }
}
