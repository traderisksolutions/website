'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams }   from 'next/navigation'
import { Suspense }          from 'react'
import SignaturePanel        from '@/components/SignaturePanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input }   from '@/components/ui/input'
import { Button }  from '@/components/ui/button'

function ReplyFromSection() {
  const [value,   setValue]   = useState('')
  const [saved,   setSaved]   = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings?key=reply_from_email')
      .then(r => r.json())
      .then(data => { if (data?.value) setValue(data.value) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!value.trim()) { setError('Email address is required'); return }
    setSaving(true); setSaved(false); setError(null)
    try {
      await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'reply_from_email', value: value.trim() }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { setError('Save failed') }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared Send-From Address</CardTitle>
        <CardDescription>
          The shared operations address emails go out from when no personal Gmail is selected.
          Must be set up as a &quot;Send as&quot; alias on the connected Gmail account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex gap-3 items-start max-w-lg">
            <div className="flex-1">
              <Input
                type="email"
                value={value}
                onChange={e => { setValue(e.target.value); setSaved(false) }}
                placeholder="e.g. operations@trade-risksol.com"
              />
              {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
            </div>
            <Button
              onClick={save}
              disabled={saving}
              className={saved ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Per-employee Gmail connection ─────────────────────────────────────────────

const ERROR_MSGS: Record<string, string> = {
  cancelled:        'Google sign-in was cancelled.',
  token:            'Failed to exchange Google auth code. Try again.',
  no_refresh_token: 'No refresh token returned — revoke TRS access in your Google account settings and reconnect.',
  db:               'Failed to save connection. Contact your admin.',
}

function GmailSection() {
  const params = useSearchParams()
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [disconnecting,  setDisconnecting]  = useState(false)

  const gmailError     = params.get('gmail_error')
  const gmailConnected = params.get('gmail_connected') === '1'

  useEffect(() => {
    fetch('/api/email/available-senders', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((senders: { email: string; type: string }[]) => {
        const personal = Array.isArray(senders) ? senders.find(s => s.type === 'personal') : null
        setConnectedEmail(personal?.email ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [gmailConnected]) // re-fetch after successful connect redirect

  async function disconnect() {
    setDisconnecting(true)
    try {
      await fetch('/api/auth/gmail/disconnect', { method: 'DELETE' })
      setConnectedEmail(null)
    } catch { /* ignore */ }
    finally { setDisconnecting(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Gmail</CardTitle>
        <CardDescription>
          Connect your personal @trade-risksol.com Gmail so you can send replies from your own address.
          Once connected, you&apos;ll see it in the &quot;From:&quot; dropdown in the Engagement panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {gmailError && (
          <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
            {ERROR_MSGS[gmailError] ?? 'Connection failed. Please try again.'}
          </div>
        )}
        {gmailConnected && !gmailError && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            Gmail connected successfully.
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : connectedEmail ? (
          <div className="flex items-center gap-3 max-w-lg">
            <div className="flex items-center gap-2 flex-1 rounded-md border border-border bg-muted/40 px-3 py-2">
              <span className="text-[11px] font-semibold text-emerald-600">✓ Connected</span>
              <span className="text-sm text-foreground">{connectedEmail}</span>
            </div>
            <Button
              variant="outline"
              onClick={disconnect}
              disabled={disconnecting}
              className="text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
            >
              {disconnecting ? 'Removing…' : 'Disconnect'}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 max-w-lg">
            <p className="text-sm text-muted-foreground flex-1">No personal Gmail connected — emails send from the shared address.</p>
            <Button asChild>
              <a href="/api/auth/gmail/connect">Connect Gmail</a>
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-lg">
          This uses a separate Google OAuth grant (gmail.send scope only). Your email content is never stored — only an access token for sending.
        </p>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Email sending configuration, Gmail accounts, and signatures</p>
      </div>
      <div className="flex flex-col gap-6">
        <Suspense>
          <GmailSection />
        </Suspense>
        <ReplyFromSection />
        <SignaturePanel />
      </div>
    </div>
  )
}
