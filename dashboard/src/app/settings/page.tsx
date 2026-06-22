'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams }   from 'next/navigation'
import SignaturePanel        from '@/components/SignaturePanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id:          string
  is_admin:    boolean
  gmail_email: string | null
}

const ERROR_MSGS: Record<string, string> = {
  cancelled:        'Google sign-in was cancelled.',
  token:            'Failed to exchange Google auth code. Try again.',
  no_refresh_token: 'No refresh token returned — revoke TRS access in your Google account settings and reconnect.',
  db:               'Failed to save connection. Contact your admin.',
}

// ── Gmail connection card ─────────────────────────────────────────────────────

function GmailSection({ profile, onProfileChange }: { profile: Profile | null; onProfileChange: () => void }) {
  const params         = useSearchParams()
  const [disconnecting, setDisconnecting] = useState(false)

  const gmailError     = params.get('gmail_error')
  const gmailConnected = params.get('gmail_connected') === '1'
  const connectedEmail = profile?.gmail_email ?? null

  async function disconnect() {
    setDisconnecting(true)
    try {
      await fetch('/api/auth/gmail/disconnect', { method: 'DELETE' })
      onProfileChange()
    } catch { /* ignore */ }
    finally { setDisconnecting(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Gmail</CardTitle>
        <CardDescription>
          Connect your personal @trade-risksol.com Gmail so you can send replies from your own address.
          Once connected, you&apos;ll see it and its signature in the &quot;From:&quot; dropdown in the Engagement panel.
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
            Gmail connected successfully — add your signature below.
          </div>
        )}

        {!profile ? (
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

function SettingsContent() {
  const [profile, setProfile] = useState<Profile | null>(null)

  async function loadProfile() {
    const res = await fetch('/api/auth/profile', { cache: 'no-store' })
    if (res.ok) setProfile(await res.json())
  }

  useEffect(() => { loadProfile() }, [])

  return (
    <div className="flex flex-col gap-6">
      <GmailSection profile={profile} onProfileChange={loadProfile} />
      <SignaturePanel profile={profile} />
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Gmail accounts, signatures, and sending addresses</p>
      </div>
      <Suspense>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
