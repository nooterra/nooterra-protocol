# ACARD (Agent Card) Specification

## Structure
```json
{
  "did": "did:noot:agent",
  "endpoint": "https://agent-domain.com",
  "publicKey": "<base58 ed25519>",
  "version": 1,
  "lineage": "<optional prior acard hash/version>",
  "capabilities": [
    {
      "id": "cap.example.v1",
      "description": "...",
      "inputSchema": {},
      "outputSchema": {},
      "embeddingDim": 1536
    }
  ],
  "metadata": {}
}
```

## Canonicalization
- Stable JSON: did, endpoint, publicKey, version, lineage, capabilities (mapped to ordered fields), metadata.

## Hashing
- `hashACARD` = `sha512` (via tweetnacl hash) over canonical JSON bytes.

## Signing
- Use ed25519:
  - `signature = ed25519_sign(canonical_json, secretKey)`
  - Encode signature and publicKey in base58.

## Verification
- Decode publicKey/signature (base58), verify ed25519 over canonical JSON.

## Versioning / Lineage
- `version`: integer increment
- `lineage`: optional pointer to prior ACARD hash/version for audit trail

## Capability Constraints (recommended)
- `id`: required
- `description`: required
- `inputSchema/outputSchema`: optional JSON schema
- `embeddingDim`: optional, if capability uses vector embeddings

## Usage
- Registry should store ACARD and signature.
- On registration/update:
  - Validate signature matches publicKey.
  - Validate endpoint/capabilities.
  - Store lineage/version in `acard_versions`.

## SDK Support
- `src/acard.ts` provides `hashACARD`, `signACARD`, `verifyACARD` utilities.
