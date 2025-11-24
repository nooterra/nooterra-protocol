import fetch from "node-fetch";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

export async function validateOutputSchema(registryUrl: string, capabilityId: string, result: any): Promise<{ valid: boolean; errors?: any }> {
  if (!registryUrl || !capabilityId) return { valid: true };
  try {
    const schemaUrl = `${registryUrl}/v1/capability/${encodeURIComponent(capabilityId)}/schema`;
    const res = await fetch(schemaUrl);
    if (!res.ok) {
      return { valid: true }; // fail open for now
    }
    const schema: any = await res.json();
    const validate = ajv.compile(schema as any);
    const ok = validate(result);
    return { valid: !!ok, errors: validate.errors };
  } catch (err) {
    return { valid: true };
  }
}
