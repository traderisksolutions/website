'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserSignature {
  id:              string
  name:            string
  title:           string | null
  phone:           string | null
  email:           string | null
  company_tagline: string | null
  is_active:       boolean
  sending_email:   string | null
  owner_user_id:   string | null
}

interface Profile {
  id:          string
  is_admin:    boolean
  gmail_email: string | null
}

interface AddressRow {
  email:    string
  type:     'personal' | 'shared'
  sig:      UserSignature | null
}

type FormState = {
  name:            string
  title:           string
  phone:           string
  email:           string
  company_tagline: string
}

const MAX_SHARED = 10

const ALLOWED_DOMAIN = 'trade-risksol.com'

function isAllowedEmail(e: string) {
  return e.trim().toLowerCase().split('@')[1] === ALLOWED_DOMAIN
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: 'personal' | 'shared' }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0,
      background: type === 'personal' ? 'var(--primary-light-bg, rgba(15,61,145,0.08))' : 'hsl(var(--muted))',
      color:      type === 'personal' ? 'var(--primary-hex, #1d4ed8)' : 'var(--text-secondary, #6b7280)',
      border:     `1px solid ${type === 'personal' ? 'var(--primary-light-border, rgba(15,61,145,0.18))' : 'hsl(var(--border))'}`,
    }}>
      {type === 'personal' ? 'You · Gmail' : 'Shared'}
    </span>
  )
}

function SigPreview({ sig }: { sig: UserSignature }) {
  const parts = [sig.title, sig.phone, sig.email].filter(Boolean)
  return (
    <div>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #111)' }}>{sig.name}</p>
      {parts.length > 0 && (
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>{parts.join(' · ')}</p>
      )}
      {sig.company_tagline && (
        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-muted, #9ca3af)', opacity: 0.8 }}>{sig.company_tagline}</p>
      )}
    </div>
  )
}

function InlineForm({
  sendingEmail,
  initial,
  saving,
  error,
  onSave,
  onCancel,
  onChange,
}: {
  sendingEmail: string
  initial: FormState
  saving: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
  onChange: (f: FormState) => void
}) {
  const [form, setForm] = useState<FormState>(initial)

  useEffect(() => { setForm(initial) }, [initial.name]) // reset when target address changes

  function update(key: keyof FormState, val: string) {
    const next = { ...form, [key]: val }
    setForm(next)
    onChange(next)
  }

  const inp: React.CSSProperties = {
    width: '100%', fontSize: 12, padding: '6px 9px',
    border: '1px solid hsl(var(--border))', borderRadius: 6,
    background: 'hsl(var(--background))', color: 'var(--text-secondary)',
    boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
  }

  const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 4 }

  return (
    <div style={{ padding: '14px 20px', background: 'hsl(var(--muted) / 0.5)', borderTop: '1px solid hsl(var(--border))' }}>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
        Signature for <strong style={{ color: 'var(--text-secondary)' }}>{sendingEmail}</strong>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Full Name *</label>
          <input style={inp} value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Jarod Hong" />
        </div>
        <div>
          <label style={lbl}>Title</label>
          <input style={inp} value={form.title} onChange={e => update('title', e.target.value)} placeholder="e.g. Risk Analyst" />
        </div>
        <div>
          <label style={lbl}>Phone</label>
          <input style={inp} value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="e.g. +65 9123 4567" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Reply-to Email in Signature</label>
          <input style={inp} value={form.email} onChange={e => update('email', e.target.value)} placeholder={sendingEmail} />
        </div>
        <div>
          <label style={lbl}>Company Tagline / Website</label>
          <input style={inp} value={form.company_tagline} onChange={e => update('company_tagline', e.target.value)} placeholder="Trade Risk Solutions | www.trade-risksol.com" />
        </div>
      </div>
      {error && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#ef4444' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSave} disabled={saving}
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: '#fff', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SignaturePanel({ profile }: { profile: Profile | null }) {
  const [sigs,       setSigs]       = useState<UserSignature[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editEmail,  setEditEmail]  = useState<string | null>(null)   // which address row is expanded
  const [formState,  setFormState]  = useState<FormState>({ name: '', title: '', phone: '', email: '', company_tagline: '' })
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)   // sig id pending delete
  const [deleting,   setDeleting]   = useState(false)

  // Shared alias management (admin only)
  const [sharedEmails,  setSharedEmails]  = useState<string[]>([])
  const [newAlias,      setNewAlias]      = useState('')
  const [aliasError,    setAliasError]    = useState<string | null>(null)
  const [aliasSaving,   setAliasSaving]   = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [sigRes, settingsRes] = await Promise.all([
      fetch('/api/signatures', { cache: 'no-store' }),
      fetch('/api/settings?key=shared_email_senders', { cache: 'no-store' }),
    ])
    const sigData      = sigRes.ok ? await sigRes.json() : []
    const settingsData = settingsRes.ok ? await settingsRes.json() : {}

    setSigs(Array.isArray(sigData) ? sigData : [])

    // Parse shared senders (stored as JSON string in value field)
    if (typeof settingsData?.value === 'string') {
      try {
        const parsed = JSON.parse(settingsData.value)
        if (Array.isArray(parsed)) {
          setSharedEmails(parsed.map((e: { email: string }) => e.email).filter(Boolean))
        }
      } catch { /* leave empty */ }
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Build the merged address list
  const personalEmail = profile?.gmail_email?.toLowerCase() ?? null

  const addressRows: AddressRow[] = []

  // Personal Gmail first (if connected and not already in shared list)
  if (personalEmail && !sharedEmails.map(e => e.toLowerCase()).includes(personalEmail)) {
    addressRows.push({
      email: personalEmail,
      type:  'personal',
      sig:   sigs.find(s => s.sending_email?.toLowerCase() === personalEmail) ?? null,
    })
  }

  // Shared aliases
  for (const em of sharedEmails) {
    addressRows.push({
      email: em.toLowerCase(),
      type:  'shared',
      sig:   sigs.find(s => s.sending_email?.toLowerCase() === em.toLowerCase()) ?? null,
    })
  }

  const isAdmin      = profile?.is_admin ?? false
  const sharedCount  = sharedEmails.length
  const canAddAlias  = isAdmin && sharedCount < MAX_SHARED

  function openEdit(row: AddressRow) {
    setEditEmail(row.email)
    setFormError(null)
    setConfirmDel(null)
    if (row.sig) {
      setFormState({
        name:            row.sig.name,
        title:           row.sig.title           ?? '',
        phone:           row.sig.phone           ?? '',
        email:           row.sig.email           ?? '',
        company_tagline: row.sig.company_tagline ?? '',
      })
    } else {
      setFormState({ name: '', title: '', phone: '', email: row.email, company_tagline: '' })
    }
  }

  function closeEdit() {
    setEditEmail(null)
    setFormError(null)
    setConfirmDel(null)
  }

  async function saveSignature(row: AddressRow) {
    if (!formState.name.trim()) { setFormError('Name is required'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        name:            formState.name.trim(),
        title:           formState.title.trim()           || null,
        phone:           formState.phone.trim()           || null,
        email:           formState.email.trim()           || null,
        company_tagline: formState.company_tagline.trim() || null,
        sending_email:   row.email,
      }

      if (row.sig) {
        // Update existing
        const res = await fetch(`/api/signatures/${row.sig.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }))
          setFormError(err.error ?? 'Save failed')
          return
        }
        const updated = await res.json()
        setSigs(prev => prev.map(s => s.id === row.sig!.id ? { ...s, ...updated } : s))
      } else {
        // Create new
        const res = await fetch('/api/signatures', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }))
          setFormError(err.error ?? 'Save failed')
          return
        }
        const created = await res.json()
        setSigs(prev => [...prev, created])
      }
      closeEdit()
    } finally { setSaving(false) }
  }

  async function deleteSignature(sigId: string) {
    setDeleting(true)
    try {
      await fetch(`/api/signatures/${sigId}`, { method: 'DELETE' })
      setSigs(prev => prev.filter(s => s.id !== sigId))
      setConfirmDel(null)
      if (editEmail) closeEdit()
    } finally { setDeleting(false) }
  }

  // ── Shared alias management ──────────────────────────────────────────────────

  async function persistShared(next: string[]) {
    setAliasSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'shared_email_senders', value: JSON.stringify(next.map(e => ({ email: e }))) }),
      })
      if (res.ok) setSharedEmails(next)
      else setAliasError('Failed to save — please try again')
    } catch { setAliasError('Network error') }
    finally { setAliasSaving(false) }
  }

  async function addAlias() {
    const email = newAlias.trim().toLowerCase()
    setAliasError(null)
    if (!email) { setAliasError('Enter an email address'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAliasError('Invalid email'); return }
    if (!isAllowedEmail(email)) { setAliasError(`Only @${ALLOWED_DOMAIN} addresses allowed`); return }
    if (sharedEmails.includes(email) || email === personalEmail) { setAliasError('Already in the list'); return }
    if (sharedCount >= MAX_SHARED) { setAliasError(`Max ${MAX_SHARED} shared addresses reached`); return }
    await persistShared([...sharedEmails, email])
    setNewAlias('')
  }

  async function removeAlias(email: string) {
    // Also soft-delete the signature tied to this address if any
    const tied = sigs.find(s => s.sending_email?.toLowerCase() === email.toLowerCase())
    if (tied) {
      await fetch(`/api/signatures/${tied.id}`, { method: 'DELETE' })
      setSigs(prev => prev.filter(s => s.id !== tied.id))
    }
    await persistShared(sharedEmails.filter(e => e !== email))
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'var(--text-muted)', padding: '8px 20px', textAlign: 'left', background: 'hsl(var(--muted) / 0.5)',
    borderBottom: '1px solid hsl(var(--border))',
  }

  return (
    <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #111)' }}>Email Signatures</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
            One signature per sending address. Selected automatically when you choose a From address.
          </p>
        </div>
        {isAdmin && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'hsl(var(--muted))', borderRadius: 20, padding: '3px 10px', border: '1px solid hsl(var(--border))' }}>
            {sharedCount}/{MAX_SHARED} shared slots
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ margin: '16px 20px', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : addressRows.length === 0 ? (
        <p style={{ margin: '16px 20px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {profile?.gmail_email ? 'No shared addresses configured.' : 'Connect your Gmail above or ask an admin to add a shared address.'}
        </p>
      ) : (
        <div>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr auto' }}>
            <div style={thStyle}>Sending from</div>
            <div style={thStyle}>Signature</div>
            <div style={{ ...thStyle, minWidth: 120, textAlign: 'right' }}>Action</div>
          </div>

          {/* Address rows */}
          {addressRows.map(row => {
            const canEditRow = isAdmin || row.type === 'personal'
            const isExpanded = editEmail === row.email

            return (
              <React.Fragment key={row.email}>
                {/* Main row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1.6fr auto',
                  borderBottom: `1px solid hsl(var(--border))`,
                  background: isExpanded ? 'hsl(var(--primary) / 0.04)' : '#fff',
                  transition: 'background 0.1s',
                }}>
                  {/* From address */}
                  <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{row.email}</span>
                    <TypeBadge type={row.type} />
                  </div>

                  {/* Signature preview */}
                  <div style={{ padding: '12px 20px', borderLeft: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center' }}>
                    {row.sig
                      ? <SigPreview sig={row.sig} />
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>— No signature —</span>
                    }
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '12px 16px', borderLeft: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    {canEditRow && !isExpanded && (
                      <>
                        <Button
                          size="sm" variant={row.sig ? 'outline' : 'default'}
                          onClick={() => openEdit(row)}
                          style={{ fontSize: 11, height: 28, padding: '0 10px' }}
                        >
                          {row.sig ? 'Edit' : 'Add'}
                        </Button>
                        {row.sig && !confirmDel && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => { setConfirmDel(row.sig!.id); setEditEmail(row.email) }}
                            style={{ fontSize: 11, height: 28, padding: '0 8px', color: '#ef4444' }}
                          >
                            Delete
                          </Button>
                        )}
                        {row.sig && confirmDel === row.sig.id && (
                          <>
                            <button
                              onClick={() => deleteSignature(row.sig!.id)} disabled={deleting}
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
                            >
                              {deleting ? '…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: '#fff', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {isAdmin && row.type === 'shared' && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => removeAlias(row.email)}
                            disabled={aliasSaving}
                            style={{ fontSize: 10, height: 28, padding: '0 8px', color: 'var(--text-muted)' }}
                            title="Remove this address"
                          >
                            ✕
                          </Button>
                        )}
                      </>
                    )}
                    {isExpanded && (
                      <Button size="sm" variant="ghost" onClick={closeEdit} style={{ fontSize: 11, height: 28, padding: '0 10px' }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline edit form */}
                {isExpanded && (
                  <div style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    <InlineForm
                      sendingEmail={row.email}
                      initial={formState}
                      saving={saving}
                      error={formError}
                      onSave={() => saveSignature(row)}
                      onCancel={closeEdit}
                      onChange={setFormState}
                    />
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Add shared alias — admin only */}
      {isAdmin && (
        <div style={{ padding: '14px 20px', borderTop: addressRows.length > 0 ? '1px solid hsl(var(--border))' : 'none', background: 'hsl(var(--muted) / 0.3)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Add Shared Address
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 480 }}>
            <div style={{ flex: 1 }}>
              <Input
                type="email"
                value={newAlias}
                onChange={e => { setNewAlias(e.target.value); setAliasError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                placeholder="e.g. sales@trade-risksol.com"
                disabled={!canAddAlias || aliasSaving}
                style={{ fontSize: 12, height: 34 }}
              />
              {aliasError && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>{aliasError}</p>}
              {!canAddAlias && !aliasError && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Maximum of {MAX_SHARED} shared addresses reached.</p>
              )}
            </div>
            <Button onClick={addAlias} disabled={!canAddAlias || aliasSaving} style={{ height: 34, fontSize: 12 }}>
              {aliasSaving ? 'Saving…' : 'Add'}
            </Button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            The service account handles sending — no Gmail alias setup required.
          </p>
        </div>
      )}
    </div>
  )
}
