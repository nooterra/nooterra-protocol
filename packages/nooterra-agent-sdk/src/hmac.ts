import crypto from "crypto";

export function signBody(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifySignature(secret: string, payload: string, signature?: string | string[]): boolean {
  if (!signature) return false;
  const sig = Array.isArray(signature) ? signature[0] : signature;
  const expected = signBody(secret, payload);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
