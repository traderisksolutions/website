'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams }   from 'next/navigation'
import { Suspense }          from 'react'
import SignaturePanel        from '@/components/SignaturePanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input }   from '@/components/ui/input'
import { Button }  from '@/components/ui/button'

// ── Shared sender email list ───────────────────────────────────────────────────

type SharedEntry = { email: string; verified: boolean }

const ALLOWED_DOMAINS = ['trade-risksol.com']

function isAllowedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  return ALLOWED_DOMAINS.some(d => domain === d)
}

function SharedSendersSection({ isAdmin }: { isAdmin: boolean }) {
  const [entries,  setEntries]  = useState<SharedEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings?key=shared_email_senders', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (typeof data?.value === 'string') {
          try { setEntries(JSON.parse(data.value)) } catch { /* leave empty */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function persist(next: SharedEntry[]) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'shared_email_senders', value: JSON.stringify(next) }),
      })
      if (res.ok) setEntries(next)
      else setAddError('Failed to save — please try again')
    } catch { setAddError('Network error — please try again') }
    finally { setSaving(false) }
  }

  function handleAdd() {
    const email = newEmail.trim().toLowerCase()
    setAddError(null)
    if (!email) { setAddError('Enter an email address'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAddError('Invalid email address'); return }
    if (!isAllowedEmail(email)) { setAddError(`Only ${ALLOWED_DOMAINS.join(', ')} addresses allowed`); return }
    if (entries.some(e => e.email.toLowerCase() === email)) { setAddError('Already in the list'); return }
    persist([...entries, { email, verified: false }])
    setNewEmail('')
  }

  function handleRemove(email: string) {
    persist(entries.filter(e => e.email !== email))
  }

  function handleToggleVerified(email: string) {
    persist(entries.map(e => e.email === email ? { ...e, verified: !e.verified } : e))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared Send-From Addresses</CardTitle>
        <CardDescription>
          {isAdmin
            ? <>Email addresses all employees can send from. Each must be set up as a &ldquo;Send as&rdquo; alias in the shared Gmail account — mark it as <strong>Verified</strong> once confirmed. Only <code>@trade-risksol.com</code> addresses are allowed.</>
            : 'Shared email addresses available to send from in the Engagement panel. Contact your admin to add or remove addresses.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Address list */}
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No shared addresses configured.</p>
            ) : (
              <div className="flex flex-col gap-2 max-w-lg">
                {entries.map(e => (
                  <div key={e.email} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span className="flex-1 text-sm text-foreground">{e.email}</span>
                    {isAdmin ? (
                      <>
                        <button
                          onClick={() => handleToggleVerified(e.email)}
                          disabled={saving}
                          title={e.verified ? 'Mark as not verified' : 'Mark as verified (alias confirmed in Gmail)'}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                            e.verified
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {e.verified ? '✓ Verified' : '⚠ Not verified'}
                        </button>
                        <button
                          onClick={() => handleRemove(e.email)}
                          disabled={saving}
                          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors px-1"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        e.verified
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {e.verified ? '✓ Verified' : '⚠ Not verified'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new — admin only */}
            {isAdmin && (
              <div className="flex gap-3 items-start max-w-lg">
                <div className="flex-1">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setAddError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                    placeholder="e.g. sales@trade-risksol.com"
                  />
                  {addError && <p className="text-xs text-destructive mt-1.5">{addError}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    After adding, set up a &ldquo;Send as&rdquo; alias in Gmail Settings → Accounts, then click &ldquo;Not verified&rdquo; to mark it ready.
                  </p>
                </div>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? 'Saving…' : 'Add'}
                </Button>
              </div>
            )}
          </>
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
  }, [gmailConnected])

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/profile', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (data?.is_admin) setIsAdmin(true) })
      .catch(() => {})
  }, [])

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
        <SharedSendersSection isAdmin={isAdmin} />
        <SignaturePanel />
      </div>
    </div>
  )
}
