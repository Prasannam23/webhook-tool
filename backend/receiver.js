import express from 'express'
import crypto from 'crypto'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)

// Tighten "origin" to your real frontend URL in production.
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

app.use(cors())

// Capture the exact raw bytes received, before JSON.parse touches them.
// The HMAC must be computed over the raw body, not JSON.stringify(req.body),
// since re-serializing can change key order / whitespace and break the signature.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8')
  }
}))

// --- In-memory, per-client secret store -------------------------------
// clientId -> secret
// Swap this Map for Redis/a database if you need it to survive a restart
// or to run more than one backend instance.
const secrets = new Map()

/**
 * A frontend calls this once with the secret a user typed in.
 * We generate a clientId, remember the secret against it, and hand back
 * a webhook URL scoped to that clientId. Nothing is hardcoded server-side.
 */
app.post('/api/register', (req, res) => {
  const { secret } = req.body || {}
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return res.status(400).json({ error: 'secret is required' })
  }

  const clientId = crypto.randomUUID()
  secrets.set(clientId, secret.trim())

  res.json({
    clientId,
    webhookUrl: `/webhook/${clientId}`
  })
})

/** Optional: rotate the secret for an existing clientId without a new URL. */
app.post('/api/rotate/:clientId', (req, res) => {
  const { clientId } = req.params
  const { secret } = req.body || {}

  if (!secrets.has(clientId)) {
    return res.status(404).json({ error: 'unknown clientId' })
  }
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return res.status(400).json({ error: 'secret is required' })
  }

  secrets.set(clientId, secret.trim())
  res.json({ ok: true })
})

/** Optional cleanup so a browser tab can deregister when it's done. */
app.delete('/api/register/:clientId', (req, res) => {
  secrets.delete(req.params.clientId)
  res.json({ ok: true })
})

/**
 * The actual webhook endpoint. Whoever is sending webhooks posts here,
 * to the URL that included their clientId. We look up which secret
 * belongs to that clientId and validate the signature against it.
 */
app.post('/webhook/:clientId', (req, res) => {
  const { clientId } = req.params
  const secret = secrets.get(clientId)

  if (!secret) {
    return res.status(404).json({ error: 'unknown clientId — register a secret first' })
  }

  const signature = req.headers['x-webhook-signature']
  const timestamp = req.headers['x-webhook-timestamp']

  if (!signature || !timestamp) {
    return res.status(400).json({ error: 'missing x-webhook-signature or x-webhook-timestamp header' })
  }

  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${req.rawBody}`)
    .digest('hex')

  let validate = false
  try {
    const expectedBuf = Buffer.from(expected, 'hex')
    const actualBuf = Buffer.from(String(signature), 'hex')
    validate = expectedBuf.length === actualBuf.length &&
      crypto.timingSafeEqual(expectedBuf, actualBuf)
  } catch {
    validate = false
  }

  const event = {
    id: crypto.randomUUID(),
    topic: req.headers['x-webhook-topic'] || null,
    body: req.body,
    valid: validate,
    receivedAt: new Date().toISOString()
  }

  console.log('--- Incoming webhook ---')
  console.log('clientId:', clientId)
  console.log('topic:', event.topic)
  console.log('signature valid:', validate)
  console.log('------------------------')

  // Push straight to whichever browser tab registered this clientId.
  io.to(clientId).emit('webhook-event', event)

  if (!validate) {
    return res.status(401).json({ error: 'invalid signature' })
  }
  res.status(200).json({ message: 'ok' })
})

io.on('connection', (socket) => {
  // The frontend joins a room named after its own clientId right after
  // registering, so events for one user never leak to another.
  socket.on('join', (clientId) => {
    if (typeof clientId === 'string' && secrets.has(clientId)) {
      socket.join(clientId)
    }
  })
})

const PORT = process.env.PORT || 5000
httpServer.listen(PORT, () => {
  console.log(`receiver listening on http://localhost:${PORT}`)
})
