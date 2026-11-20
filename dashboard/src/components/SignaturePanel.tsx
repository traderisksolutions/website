'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Btn } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import { createSignature, deleteSignature as deleteSignatureAction, getSetting, listSignatures, setSetting, updateSignature } from '@/app/settings/actions'

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
    <span className={cn('self-start flex-shrink-0 rounded-full border px-[7px] py-0.5 text-small font-semibold',
      type === 'personal' ? 'bg-trs-info-bg text-trs-info border-trs-info/20' : 'bg-trs-field text-trs-muted border-trs-line')}>
      {type === 'personal' ? 'You · Gmail' : 'Shared'}
    </span>
  )
}

function SigPreview({ sig }: { sig: UserSignature }) {
  const parts = [sig.title, sig.phone, sig.email].filter(Boolean)
  return (
    <div>
      <p className="m-0 text-small font-medium text-trs-ink">{sig.name}</p>
      {parts.length > 0 && (
        <p className="m-0 mt-0.5 text-small text-trs-subtle">{parts.join(' · ')}</p>
      )}
      {sig.company_tagline && (
        <p className="m-0 mt-px text-small text-trs-subtle opacity-80">{sig.company_tagline}</p>
      )}
    </div>
  )
}

const FORM_INPUT = 'h-8 px-2.5 py-1.5 text-small text-trs-ink-2'
const FORM_LABEL = 'block mb-1 text-small font-semibold   text-trs-subtle'

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
  // No reset effect needed — this component is always unmounted when isExpanded toggles,
  // so it always receives a fresh initial from openEdit().
  const [form, setForm] = useState<FormState>(initial)

  function update(key: keyof FormState, val: string) {
    const next = { ...form, [key]: val }
    setForm(next)
    onChange(next)
  }

  return (
    <div className="px-5 py-3.5 bg-trs-tint border-t border-trs-line">
      <p className="m-0 mb-3 text-small font-medium text-trs-subtle">
        Signature for <strong className="text-trs-ink-2">{sendingEmail}</strong>
      </p>
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <div>
          <label className={FORM_LABEL}>Full Name *</label>
          <Input className={FORM_INPUT} value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Jarod Hong" />
        </div>
        <div>
          <label className={FORM_LABEL}>Title</label>
          <Input className={FORM_INPUT} value={form.title} onChange={e => update('title', e.target.value)} placeholder="e.g. Risk Analyst" />
        </div>
        <div>
          <label className={FORM_LABEL}>Phone</label>
          <Input className={FORM_INPUT} value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="e.g. +65 9123 4567" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div>
          <label className={FORM_LABEL}>Reply-to Email in Signature</label>
          <Input className={FORM_INPUT} value={form.email} onChange={e => update('email', e.target.value)} placeholder={sendingEmail} />
        </div>
        <div>
          <label className={FORM_LABEL}>Company Tagline / Website</label>
          <Input className={FORM_INPUT} value={form.company_tagline} onChange={e => update('company_tagline', e.target.value)} placeholder="Trade Risk Solutions | www.trade-risksol.com" />
        </div>
      </div>
      {error && <p className="m-0 mb-2 text-small text-trs-neg">{error}</p>}
      <div className="flex gap-2">
        <Btn level="primary" size="xs" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        <Btn size="xs" onClick={onCancel}>
          Cancel
        </Btn>
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
    const [sigRes, settingsRes] = await Promise.all([listSignatures(), getSetting('shared_email_senders')])
    const sigData      = sigRes.ok ? sigRes.data : []
    const settingsData = settingsRes.ok ? settingsRes.data : null

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
        const res = await updateSignature(row.sig.id, payload)
        if (!res.ok) { setFormError(res.error); return }
        const updated = res.data
        setSigs(prev => prev.map(s => s.id === row.sig!.id ? { ...s, ...updated } : s))
      } else {
        // Create new
        const res = await createSignature(payload)
        if (!res.ok) { setFormError(res.error); return }
        const created = res.data
        setSigs(prev => [...prev, created])
      }
      closeEdit()
    } finally { setSaving(false) }
  }

  async function deleteSignature(sigId: string) {
    setDeleting(true)
    try {
      await deleteSignatureAction(sigId)
      setSigs(prev => prev.filter(s => s.id !== sigId))
      setConfirmDel(null)
      if (editEmail) closeEdit()
    } finally { setDeleting(false) }
  }

  // ── Shared alias management ──────────────────────────────────────────────────

  async function persistShared(next: string[]) {
    setAliasSaving(true)
    try {
      const res = await setSetting('shared_email_senders', JSON.stringify(next.map(e => ({ email: e }))))
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
      await deleteSignatureAction(tied.id)
      setSigs(prev => prev.filter(s => s.id !== tied.id))
    }
    await persistShared(sharedEmails.filter(e => e !== email))
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const TH = 'px-5 py-2 text-left text-small font-semibold   text-trs-subtle bg-trs-tint border-b border-trs-line'

  return (
    <div className="rounded border border-trs-line overflow-hidden bg-white">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-trs-line flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="m-0 text-body font-medium text-trs-ink">Email signatures</h2>
          <p className="m-0 mt-0.5 text-small text-trs-subtle">
            One signature per sending address. Selected automatically when you choose a From address.
          </p>
        </div>
        {isAdmin && (
          <span className="rounded border border-trs-line bg-trs-field px-2.5 py-[3px] text-small text-trs-subtle">
            {sharedCount}/{MAX_SHARED} shared slots
          </span>
        )}
      </div>

      {loading ? (
        <p className="mx-5 my-4 text-body text-trs-subtle">Loading…</p>
      ) : addressRows.length === 0 ? (
        <p className="mx-5 my-4 text-body text-trs-subtle italic">
          {profile?.gmail_email ? 'No shared addresses configured.' : 'Connect your Gmail above or ask an admin to add a shared address.'}
        </p>
      ) : (
        <div>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1.6fr_auto]">
            <div className={TH}>Sending from</div>
            <div className={TH}>Signature</div>
            <div className={cn(TH, 'min-w-[120px] text-right')}>Action</div>
          </div>

          {/* Address rows */}
          {addressRows.map(row => {
            const canEditRow = isAdmin || row.type === 'personal'
            const isExpanded = editEmail === row.email

            return (
              <React.Fragment key={row.email}>
                {/* Main row */}
                <div className={cn('grid grid-cols-[1fr_1.6fr_auto] border-b border-trs-line transition-colors', isExpanded ? 'bg-trs-soft' : 'bg-white')}>
                  {/* From address */}
                  <div className="px-5 py-3 flex flex-col gap-1 justify-center">
                    <span className="text-small text-trs-ink-2 font-mono break-all">{row.email}</span>
                    <TypeBadge type={row.type} />
                  </div>

                  {/* Signature preview */}
                  <div className="px-5 py-3 border-l border-trs-line flex items-center">
                    {row.sig
                      ? <SigPreview sig={row.sig} />
                      : <span className="text-small text-trs-subtle italic">— No signature —</span>
                    }
                  </div>

                  {/* Actions */}
                  <div className="px-4 py-3 border-l border-trs-line flex items-center gap-1.5 justify-end">
                    {canEditRow && !isExpanded && (
                      <>
                        <Button
                          size="sm" variant={row.sig ? 'outline' : 'default'}
                          onClick={() => openEdit(row)}
                        >
                          {row.sig ? 'Edit' : 'Add'}
                        </Button>
                        {row.sig && !confirmDel && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setConfirmDel(row.sig!.id)}
                            className="text-trs-neg hover:text-trs-neg"
                          >
                            Delete
                          </Button>
                        )}
                        {row.sig && confirmDel === row.sig.id && (
                          <>
                            <Btn
                              level="danger" size="xs"
                              onClick={() => deleteSignature(row.sig!.id)} disabled={deleting}
                            >
                              {deleting ? '…' : 'Confirm'}
                            </Btn>
                            <Btn
                              size="xs"
                              onClick={() => setConfirmDel(null)}
                            >
                              Cancel
                            </Btn>
                          </>
                        )}
                        {isAdmin && row.type === 'shared' && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => removeAlias(row.email)}
                            disabled={aliasSaving}
                            className="px-2 text-small"
                            title="Remove this address"
                          >
                            ✕
                          </Button>
                        )}
                      </>
                    )}
                    {isExpanded && (
                      <Button size="sm" variant="ghost" onClick={closeEdit}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline edit form */}
                {isExpanded && (
                  <div className="border-b border-trs-line">
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
        <div className={cn('px-5 py-3.5 bg-trs-tint', addressRows.length > 0 && 'border-t border-trs-line')}>
          <p className="m-0 mb-2 text-small font-semibold text-trs-subtle">
            Add Shared Address
          </p>
          <div className="flex gap-2 items-start max-w-[480px]">
            <div className="flex-1">
              <Input
                type="email"
                value={newAlias}
                onChange={e => { setNewAlias(e.target.value); setAliasError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                placeholder="e.g. sales@trade-risksol.com"
                disabled={!canAddAlias || aliasSaving}
                className="h-9 text-small"
              />
              {aliasError && <p className="m-0 mt-1 text-small text-trs-neg">{aliasError}</p>}
              {!canAddAlias && !aliasError && (
                <p className="m-0 mt-1 text-small text-trs-subtle">Maximum of {MAX_SHARED} shared addresses reached.</p>
              )}
            </div>
            <Button onClick={addAlias} disabled={!canAddAlias || aliasSaving} className="h-9 text-small">
              {aliasSaving ? 'Saving…' : 'Add'}
            </Button>
          </div>
          <p className="m-0 mt-1.5 text-small text-trs-subtle">
            The service account handles sending — no Gmail alias setup required.
          </p>
        </div>
      )}
    </div>
  )
}
