import express from 'express'
import crypto from 'crypto'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)


const io = new Server(httpServer, {
  cors: { origin: '*' }
})

app.use(cors())

.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8')
  }
}))


const secrets = new Map()


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


app.delete('/api/register/:clientId', (req, res) => {
  secrets.delete(req.params.clientId)
  res.json({ ok: true })
})

app.get('/health',(req,res)=>{
  return res.status(200).json({message : 'service is working'})
})
 
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

  
  io.to(clientId).emit('webhook-event', event)

  if (!validate) {
    return res.status(401).json({ error: 'invalid signature' })
  }
  res.status(200).json({ message: 'ok' })
})

io.on('connection', (socket) => {
  
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
