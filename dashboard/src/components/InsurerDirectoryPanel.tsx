'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id:            string
  product_line:  string
  contact_id:    string | null
  contact_name:  string | null
  contact_email: string
  role_title:    string | null
  notes:         string | null
  updated_at:    string
}

interface Insurer {
  id:               string
  name:             string
  status:           string
  insurer_contacts: Contact[]
}

// ── Add-contact inline form ───────────────────────────────────────────────────

const EMPTY_CONTACT = { product_line: PRODUCT_LINES[0].slug, name: '', email: '', role_title: '', notes: '' }

function ContactForm({
  initial, saving, error, onSave, onCancel,
}: {
  initial: typeof EMPTY_CONTACT
  saving:  boolean
  error:   string | null
  onSave:  (c: typeof EMPTY_CONTACT) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof EMPTY_CONTACT, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="bg-muted/40 rounded-md p-3 flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-2 items-start">
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={form.product_line}
          onChange={e => set('product_line', e.target.value)}
        >
          {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
        </select>
        <Input placeholder="Contact name" value={form.name} onChange={e => set('name', e.target.value)} />
        <Input placeholder="name@insurer.com" value={form.email} onChange={e => set('email', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-start">
        <Input placeholder="Role / title (optional)" value={form.role_title} onChange={e => set('role_title', e.target.value)} />
        <Input placeholder="Notes (optional)" value={form.notes} onChange={e => set('notes', e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave(form)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Saving links this person to the line and adds them to Active Contacts if they're new.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ── One insurer block ─────────────────────────────────────────────────────────

function InsurerRow({ insurer, onChange }: { insurer: Insurer; onChange: () => void }) {
  const [adding, setAdding]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState<string | null>(null)

  async function addContact(c: typeof EMPTY_CONTACT) {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/settings/insurers/contacts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ insurer_id: insurer.id, ...c }),
      })
      if (!res.ok) { setError((await res.json()).error ?? 'Failed to add'); return }
      setAdding(false)
      onChange()
    } finally { setSaving(false) }
  }

  async function removeContact(id: string) {
    await fetch(`/api/settings/insurers/contacts?id=${id}`, { method: 'DELETE' })
    onChange()
  }

  async function removeInsurer() {
    if (!confirm(`Remove ${insurer.name} and all its contacts?`)) return
    await fetch(`/api/settings/insurers?id=${insurer.id}`, { method: 'DELETE' })
    onChange()
  }

  const contacts = [...insurer.insurer_contacts].sort((a, b) =>
    productLineLabel(a.product_line).localeCompare(productLineLabel(b.product_line)))

  return (
    <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{insurer.name}</span>
          <span className="text-[11px] text-muted-foreground">
            {contacts.length} {contacts.length === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <button onClick={removeInsurer} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
          Remove
        </button>
      </div>

      {contacts.length > 0 && (
        <div className="flex flex-col divide-y divide-border/60">
          {contacts.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-44 shrink-0 font-medium text-foreground/90">{productLineLabel(c.product_line)}</span>
              <span className="w-40 shrink-0 text-muted-foreground truncate">
                {c.contact_name || '—'}{c.role_title ? <span className="text-muted-foreground/60"> · {c.role_title}</span> : null}
              </span>
              <span className="flex-1 text-muted-foreground truncate">{c.contact_email}</span>
              <button onClick={() => removeContact(c.id)} className="text-xs text-muted-foreground hover:text-destructive shrink-0">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {adding
        ? <ContactForm initial={EMPTY_CONTACT} saving={saving} error={error} onSave={addContact} onCancel={() => { setAdding(false); setError(null) }} />
        : <button onClick={() => setAdding(true)} className="self-start text-xs font-medium text-primary hover:underline">+ Add product line</button>}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function InsurerDirectoryPanel() {
  const [insurers, setInsurers] = useState<Insurer[] | null>(null)
  const [newName,  setNewName]  = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/settings/insurers', { cache: 'no-store' })
    if (res.ok) setInsurers(await res.json())
  }, [])

  useEffect(() => { load() }, [load])

  async function addInsurer() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/settings/insurers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newName.trim() }),
      })
      if (res.ok) { setNewName(''); await load() }
    } finally { setCreating(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insurer Directory</CardTitle>
        <CardDescription>
          Insurance partners and their point person for each product line. The RFQ agent uses this
          to route quotation requests — add a line per insurer (e.g. AIA · Commercial Property).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 max-w-md">
          <Input
            placeholder="Add an insurer (e.g. AIA, Chubb, QBE)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addInsurer() }}
          />
          <Button onClick={addInsurer} disabled={creating || !newName.trim()}>
            {creating ? 'Adding…' : 'Add'}
          </Button>
        </div>

        {insurers === null
          ? <p className="text-sm text-muted-foreground">Loading…</p>
          : insurers.length === 0
            ? <p className="text-sm text-muted-foreground">No insurers yet — add your first partner above.</p>
            : <div className="flex flex-col gap-3">
                {insurers.map(i => <InsurerRow key={i.id} insurer={i} onChange={load} />)}
              </div>}
      </CardContent>
    </Card>
  )
}
