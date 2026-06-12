'use client'

import React, { useEffect, useState } from 'react'
import SignaturePanel from '@/components/SignaturePanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
        <CardTitle>Reply-From Address</CardTitle>
        <CardDescription>
          The email address used as the default Reply-To on outbound emails from the Engagement Agent
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
              variant={saved ? 'default' : 'default'}
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

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage email signatures and sending configuration</p>
      </div>
      <div className="flex flex-col gap-6">
        <ReplyFromSection />
        <SignaturePanel />
      </div>
    </div>
  )
}
