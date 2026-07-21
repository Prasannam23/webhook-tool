# Webhook receiver backend

No secret is hardcoded. Each browser tab registers its own secret at runtime,
gets back a unique `clientId` and webhook URL, and only events for that
`clientId` are pushed back to it.

## Setup

```bash
cd backend
npm install
npm start
```

Runs on `http://localhost:5000` by default (override with `PORT=...`).

## How it works

1. `POST /api/register` with `{ "secret": "whsec_..." }` → returns
   `{ clientId, webhookUrl }`. The secret is kept in memory, keyed by `clientId`.
2. Point whatever is sending webhooks at
   `http://localhost:5000/webhook/<clientId>`.
3. On each incoming POST, the server recomputes the HMAC-SHA256 signature
   over the raw request body using the secret registered for that
   `clientId`, compares it with `x-webhook-signature` using a timing-safe
   comparison, and emits the result over Socket.IO to that `clientId`'s room.
4. `POST /api/rotate/:clientId` lets you swap the secret without generating
   a new URL. `DELETE /api/register/:clientId` forgets a client entirely.

## Sending a test webhook

Expected headers: `x-webhook-signature`, `x-webhook-timestamp`, optionally
`x-webhook-topic`. Signature = `HMAC_SHA256(secret, "<timestamp>.<raw body>")`,
hex-encoded.

```bash
node -e "
const crypto = require('crypto');
const secret = 'whsec_...';           // same secret you registered
const body = JSON.stringify({ hello: 'world' });
const timestamp = Date.now().toString();
const sig = crypto.createHmac('sha256', secret).update(\`\${timestamp}.\${body}\`).digest('hex');
console.log('x-webhook-timestamp:', timestamp);
console.log('x-webhook-signature:', sig);
"
```

Then:

```bash
curl -X POST http://localhost:5000/webhook/<clientId> \
  -H "Content-Type: application/json" \
  -H "x-webhook-topic: order.created" \
  -H "x-webhook-timestamp: <timestamp from above>" \
  -H "x-webhook-signature: <signature from above>" \
  -d '{"hello":"world"}'
```

## Notes on scaling this up

- Secrets live in a plain in-memory `Map`. Restarting the process forgets
  every registered client. Swap it for Redis or a database if you need
  persistence or want to run more than one backend instance.
- Lock down the Socket.IO/CORS `origin: '*'` to your real frontend domain
  before deploying anywhere public.
- Consider expiring unused `clientId`s after a period of inactivity so the
  map doesn't grow forever.
