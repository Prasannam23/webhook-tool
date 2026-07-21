'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

type WebhookEvent = {
  id: string
  topic: string | null
  body: unknown
  valid: boolean
  receivedAt: string
}

export default function Home() {
  const [secret, setSecret] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!secret.trim()) {
      setError('Enter a secret first.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Registration failed (${res.status})`)
      }

      const data = await res.json()
      setClientId(data.clientId)
      setWebhookUrl(`${BACKEND_URL}${data.webhookUrl}`)
      setEvents([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the backend.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setClientId(null)
    setWebhookUrl(null)
    setSecret('')
    setError(null)
  }

  useEffect(() => {
    if (!clientId) return

    const socket = io(BACKEND_URL)
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join', clientId)
    })

    socket.on('webhook-event', (event: WebhookEvent) => {
      setEvents((prev) => [event, ...prev])
    })

    return () => {
      socket.disconnect()
    }
  }, [clientId])

  return (
    <main className="wrap">
      <p className="eyebrow">webhook inspector</p>
      <h1>Watch your webhooks arrive, validated live</h1>
      <p className="lede">
        Register a signing secret to get a private webhook URL. The secret
        never lives in this codebase — it&apos;s handed to the backend at
        request time and kept only in memory, scoped to you.
      </p>

      <div className="terminal">
        <div className="terminal-head">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
        <div className="terminal-body">
          {!clientId ? (
            <form onSubmit={handleRegister}>
              <div className="prompt-row">
                <span className="prompt-sign">$</span>
                <input
                  className="secret-input"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="paste your signing secret, e.g. whsec_..."
                  autoFocus
                />
                <span className="cursor" />
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? 'registering…' : 'register'}
                </button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </form>
          ) : (
            <div className="url-block">
              <p className="url-label">your webhook url</p>
              <p className="url-value">
                {webhookUrl}
                <span className="cursor" />
              </p>
              <div className="rotate-row">
                <button className="btn btn-ghost" onClick={handleReset} type="button">
                  use a different secret
                </button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
          )}
        </div>
      </div>

      {clientId && (
        <section>
          <p className="section-label">incoming events</p>
          {events.length === 0 ? (
            <p className="empty">Nothing yet — point a sender at your webhook URL above.</p>
          ) : (
            <ul className="events">
              {events.map((ev) => (
                <li className="event" key={ev.id}>
                  <div className="event-head">
                    <span className="event-topic">{ev.topic || '(no topic header)'}</span>
                    <span className={`status ${ev.valid ? 'valid' : 'invalid'}`}>
                      {ev.valid ? 'valid signature' : 'invalid signature'}
                    </span>
                  </div>
                  <p className="event-time">{ev.receivedAt}</p>
                  <pre className="event-body">{JSON.stringify(ev.body, null, 2)}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
