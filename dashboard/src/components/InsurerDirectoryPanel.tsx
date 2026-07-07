'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { groupedProductLines, productLineLabel } from '@/lib/product-lines'

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

interface PersonResult {
  id:         string
  first_name: string | null
  last_name:  string | null
  email:      string | null
  company:    string | null
}

function personName(p: PersonResult) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
}

// ── Add-point-person dialog ───────────────────────────────────────────────────
// Search Active Contacts → pick a person → tag them to one or more product lines.
// People are created on the Active Contacts page, never here.

function AddPointPersonDialog({
  insurer, open, onOpenChange, onSaved,
}: {
  insurer:      Insurer
  open:         boolean
  onOpenChange: (v: boolean) => void
  onSaved:      () => void
}) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const [person,   setPerson]   = useState<PersonResult | null>(null)
  const [lines,    setLines]    = useState<Set<string>>(new Set())
  const [role,     setRole]     = useState('')
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset everything whenever the dialog opens.
  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setPerson(null); setLines(new Set()); setRole(''); setNotes(''); setError(null) }
  }, [open])

  // Debounced contact search.
  useEffect(() => {
    if (!open) return
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        setResults(res.ok ? await res.json() : [])
      } finally { setSearching(false) }
    }, 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, open])

  function toggleLine(slug: string) {
    setLines(prev => { const next = new Set(prev); next.has(slug) ? next.delete(slug) : next.add(slug); return next })
  }

  async function save() {
    if (!person || lines.size === 0) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/settings/insurers/contacts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          insurer_id:    insurer.id,
          contact_id:    person.id,
          product_lines: Array.from(lines),
          role_title:    role.trim() || null,
          notes:         notes.trim() || null,
        }),
      })
      if (!res.ok) { setError((await res.json()).error ?? 'Failed to save'); return }
      onSaved()
      onOpenChange(false)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add point person — {insurer.name}</DialogTitle>
          <DialogDescription>Pick someone from Active Contacts, then tag the lines they cover.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Step 1 — pick a person */}
          {person ? (
            <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{personName(person)}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {person.email ?? 'no email'}{person.company ? ` · ${person.company}` : ''}
                </p>
              </div>
              <button onClick={() => setPerson(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Change</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                autoFocus
                placeholder="Search Active Contacts by name or email…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                {searching && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching contacts.</p>
                )}
                {!searching && query.trim().length < 2 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Type at least 2 characters.</p>
                )}
                {results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setPerson(r)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                  >
                    <p className="text-sm text-foreground">{personName(r)}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.email ?? 'no email'}{r.company ? ` · ${r.company}` : ''}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Can’t find them?{' '}
                <Link href="/contacts" className="text-primary hover:underline">Add them in Active Contacts →</Link>
              </p>
            </div>
          )}

          {/* Step 2 — tag product lines (grouped like the website navbar) */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-foreground/80">Product lines</span>
            {groupedProductLines().map(g => (
              <div key={g.key} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{g.label}</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {g.sections.flatMap(s => s.lines).map(p => (
                    <label key={p.slug} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-muted/50">
                      <input type="checkbox" checked={lines.has(p.slug)} onChange={() => toggleLine(p.slug)} className="accent-primary" />
                      <span className="truncate">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Optional link details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input placeholder="Role / title (optional)" value={role} onChange={e => setRole(e.target.value)} />
            <Input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !person || lines.size === 0}>
            {saving ? 'Saving…' : `Add${lines.size > 1 ? ` (${lines.size} lines)` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── One insurer block ─────────────────────────────────────────────────────────

function InsurerRow({ insurer, onChange }: { insurer: Insurer; onChange: () => void }) {
  const [adding, setAdding] = useState(false)

  async function removeContact(id: string) {
    await fetch(`/api/settings/insurers/contacts?id=${id}`, { method: 'DELETE' })
    onChange()
  }

  async function removeInsurer() {
    if (!confirm(`Remove ${insurer.name} and all its linked contacts?`)) return
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

      <button onClick={() => setAdding(true)} className="self-start text-xs font-medium text-primary hover:underline">
        + Add point person
      </button>

      <AddPointPersonDialog insurer={insurer} open={adding} onOpenChange={setAdding} onSaved={onChange} />
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
          to route quotation requests. Point people come from Active Contacts — add an insurer, then
          tag a contact to the lines they cover.
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
