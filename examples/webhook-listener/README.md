# Nooterra Webhook Listener (example)

A minimal Node HTTP server that verifies `x-nooterra-signature` and logs events.

## Run

```
cd examples/webhook-listener
WEBHOOK_SECRET=your_shared_secret PORT=4001 node server.mjs
```

Point your task publish payload to include `webhookUrl: "https://your-ngrok-or-host/webhook"` and set the same `WEBHOOK_SECRET` in coordinator env.

Expected headers:
- `x-nooterra-event`
- `x-nooterra-event-id`
- `x-nooterra-signature` (HMAC sha256 of raw body with `WEBHOOK_SECRET`)
