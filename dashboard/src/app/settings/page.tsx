'use client'

import React, { useEffect, useState } from 'react'
import SignaturePanel from '@/components/SignaturePanel'

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
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111' }}>Reply-From Address</h2>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#aaa' }}>
          The email address used as the default Reply-To on outbound emails from the Engagement Agent
        </p>
      </div>
      <div style={{ padding: '20px' }}>
        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: '#bbb' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 480 }}>
            <div style={{ flex: 1 }}>
              <input
                type="email"
                value={value}
                onChange={e => { setValue(e.target.value); setSaved(false) }}
                placeholder="e.g. operations@trade-risksol.com"
                style={{
                  width: '100%', fontSize: 13, padding: '8px 12px',
                  border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff',
                  color: '#111', boxSizing: 'border-box',
                }}
              />
              {error && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#ef4444' }}>{error}</p>}
            </div>
            <button
              onClick={save} disabled={saving}
              style={{
                fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
                border: 'none', background: saved ? '#16a34a' : '#1d4ed8',
                color: '#fff', cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1, flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>Manage email signatures and sending configuration</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <ReplyFromSection />
        <SignaturePanel />
      </div>

    </div>
  )
}
