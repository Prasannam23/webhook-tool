# Webhook Inspector

Two pieces:

- **`backend/`** — your existing `receiver.js`, rewritten so the signing
  secret is never hardcoded. It's supplied per-user at runtime and kept in
  memory, keyed by a generated `clientId`.
- **`frontend/`** — a Next.js app where someone pastes their secret, gets
  back a private webhook URL, and watches validated events stream in live
  over a websocket.

## How the pieces talk to each other

```
 person types secret
        │
        ▼
 Next.js frontend  ──POST /api/register {secret}──▶  backend
        │                                                │
        │◀──────────── { clientId, webhookUrl } ─────────┘
        │
        ▼
 frontend opens a socket.io connection, joins room `clientId`
        │
        │            some external service
        │                    │
        │                    ▼
        │      POST /webhook/<clientId>  ──▶  backend validates
        │                                      signature with that
        │                                      client's secret
        │                                             │
        └────────── 'webhook-event' pushed to room ◀──┘
        ▼
 frontend renders the event
```

Because the `clientId` is a random UUID and each browser tab only ever
joins its own room, two different people registering two different secrets
get two fully isolated webhook URLs and event streams from the same running
backend — nothing is shared or overwritten between them.

## Running it locally

```bash
# terminal 1
cd backend
npm install
npm start          # http://localhost:5000

# terminal 2
cd frontend
npm install
cp .env.local.example .env.local   # points at http://localhost:5000 by default
npm run dev         # http://localhost:3000
```

Open `http://localhost:3000`, paste any secret, and use the webhook URL it
gives you as the destination for whatever is sending webhooks. See
`backend/README.md` for a copy-pasteable `curl` example that generates a
correctly signed test request.

## Before deploying this anywhere public

- Restrict CORS/socket.io `origin` in `backend/receiver.js` to your actual
  frontend domain instead of `'*'`.
- Serve both over HTTPS — the secret travels from the browser to the
  backend in the `/api/register` request body, so that request needs TLS.
- Swap the in-memory `Map` for Redis or a database if the backend needs to
  survive restarts or run as more than one instance.
- Consider expiring a `clientId` after some period of inactivity.
