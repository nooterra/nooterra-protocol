# Weather Demo (Registry + SDK)
Two scripts prove the end-to-end flow:
- Provider registers a weather capability.
- Client searches for “weather” and calls the provider endpoint.

## Prereqs
- Registry running locally on `http://localhost:3001` (qdrant/postgres up).
- SDK code available (this repo).

## Run
```bash
cd ../../sdk/typescript
npm install
npm run build

# In another shell, run the provider
cd ../../examples/weather-demo
npx tsx provider.ts

# In a second shell, run the client
npx tsx client.ts
```
The client will:
1) Search for “weather in London”
2) Receive the provider’s DID/endpoint
3) Call the provider HTTP endpoint for data (stubbed response)
