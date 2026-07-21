import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Webhook Inspector',
  description: 'Register a signing secret and watch validated webhook events arrive in real time.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
