import nacl from "tweetnacl";
import bs58 from "bs58";

function decodeKey(key: string): Uint8Array {
  // Accept base64 or base58 for convenience
  try {
    return Uint8Array.from(Buffer.from(key, "base64"));
  } catch {
    // ignore and try base58
  }
  return bs58.decode(key);
}

export function generateKeypair(): { publicKey: string; privateKey: string } {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(kp.publicKey).toString("base64"),
    privateKey: Buffer.from(kp.secretKey).toString("base64"),
  };
}

export function signPayload(payload: Uint8Array, privateKey: string): string {
  const sk = decodeKey(privateKey);
  // tweetnacl expects 64-byte secretKey; if 32-byte seed is provided, expand it
  const secretKey = sk.length === 32 ? nacl.sign.keyPair.fromSeed(sk).secretKey : sk;
  const sig = nacl.sign.detached(payload, secretKey);
  return Buffer.from(sig).toString("base64");
}

export function verifyPayload(payload: Uint8Array, signatureB64: string, publicKey: string): boolean {
  const pk = decodeKey(publicKey);
  const sig = Uint8Array.from(Buffer.from(signatureB64, "base64"));
  return nacl.sign.detached.verify(payload, sig, pk);
}

export function loadKeypairFromConfig(config: { publicKey?: string; privateKey?: string }) {
  if (config.publicKey && config.privateKey) {
    return { publicKey: config.publicKey, privateKey: config.privateKey };
  }
  const generated = generateKeypair();
  console.warn("[agent-sdk] No keypair provided; generated ephemeral keypair (not suitable for production)");
  return generated;
}
