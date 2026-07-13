'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UploadCloud, Download, AlertTriangle, Copy, UserPlus, X } from 'lucide-react'

type Existing = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company: string | null }
type Status = 'new' | 'duplicate' | 'invalid'
type Action = 'insert' | 'update' | 'skip'
interface Row {
  first_name: string; last_name: string; email: string; phone: string; company: string
  status: Status; existing: Existing | null; action: Action
}

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company'] as const
const TEMPLATE = 'first_name,last_name,email,phone,company\nJane,Tan,jane@acme.com,+65 9123 4567,Acme Pte Ltd\n'

// The exact, only accepted headers — shown to the user so the format is unambiguous.
const HEADER_SPEC: { key: string; req: 'required' | 'optional'; example: string }[] = [
  { key: 'email',      req: 'required', example: 'jane@acme.com' },
  { key: 'phone',      req: 'required', example: '+65 9123 4567' },
  { key: 'first_name', req: 'optional', example: 'Jane' },
  { key: 'last_name',  req: 'optional', example: 'Tan' },
  { key: 'company',    req: 'optional', example: 'Acme Pte Ltd' },
]

// Minimal CSV parser (quotes, commas, CRLF).
function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let field = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ',') { cur.push(field); field = '' }
    else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur) }
  return rows.filter(r => r.some(f => f.trim() !== ''))
}

const HEADER: Record<string, string> = {
  first_name: 'first_name', 'first name': 'first_name', firstname: 'first_name',
  last_name: 'last_name', 'last name': 'last_name', lastname: 'last_name',
  email: 'email', 'e-mail': 'email', phone: 'phone', 'phone number': 'phone', mobile: 'phone',
  company: 'company',
}

function reclassify(r: Row): Row {
  const hasEmail = !!r.email.trim(), hasPhone = !!r.phone.trim()
  if (!hasEmail && !hasPhone) return { ...r, status: 'invalid', action: 'skip' }
  if (r.existing) return { ...r, status: 'duplicate' }
  return { ...r, status: 'new', action: r.action === 'skip' ? 'skip' : 'insert' }
}

export default function BulkImportContacts({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const [step, setStep]   = useState<'upload' | 'review' | 'done'>('upload')
  const [rows, setRows]   = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy]   = useState(false)
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number } | null>(null)

  function reset() { setStep('upload'); setRows([]); setError(null); setResult(null) }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'contacts-template.csv'; a.click(); URL.revokeObjectURL(url)
  }

  async function onFile(file: File) {
    setError(null); setBusy(true)
    try {
      const parsed = parseCSV(await file.text())
      if (parsed.length < 2) { setError('The file has no data rows — add at least one contact below the header row.'); return }

      // Strict header validation: every column must be a recognised field, and the
      // header row must contain email and/or phone. No silent dropping of columns.
      const rawHeaders = parsed[0].map(h => h.trim()).filter(Boolean)
      const unknown    = rawHeaders.filter(h => !HEADER[h.toLowerCase()])
      if (unknown.length) {
        setError(`Unrecognised column${unknown.length > 1 ? 's' : ''}: "${unknown.join('", "')}". Accepted headers: first_name, last_name, email, phone, company. Download the template for the exact format.`)
        return
      }
      const headers = parsed[0].map(h => HEADER[h.trim().toLowerCase()] ?? '')
      if (!headers.includes('email') && !headers.includes('phone')) {
        setError('CSV must include an "email" and/or "phone" column. Download the template for the exact format.'); return
      }
      const parsedRows: Omit<Row, 'status' | 'existing' | 'action'>[] = parsed.slice(1).map(cols => {
        const rec: Record<string, string> = {}
        headers.forEach((h, i) => { if (h) rec[h] = (cols[i] ?? '').trim() })
        return { first_name: rec.first_name ?? '', last_name: rec.last_name ?? '', email: rec.email ?? '', phone: rec.phone ?? '', company: rec.company ?? '' }
      })

      const res = await fetch('/api/contacts/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'preview', rows: parsedRows }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not read the file'); return }
      const classified: Row[] = parsedRows.map((r, i) => {
        const p = (data.rows as { index: number; status: Status; existing: Existing | null }[]).find(x => x.index === i)
        const status = p?.status ?? 'new'
        return { ...r, status, existing: p?.existing ?? null, action: status === 'new' ? 'insert' : 'skip' }
      })
      setRows(classified); setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse the file')
    } finally { setBusy(false) }
  }

  function edit(i: number, field: typeof FIELDS[number], v: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? reclassify({ ...r, [field]: v }) : r))
  }
  function setAction(i: number, action: Action) { setRows(prev => prev.map((r, idx) => idx === i ? { ...r, action } : r)) }

  async function commit() {
    setBusy(true); setError(null)
    try {
      const payload = rows.map(r => ({ action: r.action, first_name: r.first_name, last_name: r.last_name, email: r.email, phone: r.phone, company: r.company, existing_id: r.existing?.id }))
      const res = await fetch('/api/contacts/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'commit', rows: payload }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Import failed'); return }
      setResult(data); setStep('done'); onImported()
    } finally { setBusy(false) }
  }

  const counts = { new: rows.filter(r => r.status === 'new').length, dup: rows.filter(r => r.status === 'duplicate').length, invalid: rows.filter(r => r.status === 'invalid').length }
  const willInsert = rows.filter(r => r.action === 'insert').length
  const willUpdate = rows.filter(r => r.action === 'update').length
  const order = { invalid: 0, duplicate: 1, new: 2 } as const

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-[860px] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV using the template. We’ll flag duplicates and rows to fix before anything is saved.'}
            {step === 'review' && `${counts.new} new · ${counts.dup} duplicate· ${counts.invalid} need fixing — review, edit, then import.`}
            {step === 'done' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload ── */}
        {step === 'upload' && (
          <div className="flex flex-col gap-3 py-2">
            {/* Explicit header spec — strict: exactly these columns, nothing else. */}
            <div className="rounded-lg border border-[--border-subtle] bg-muted/30 px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-2">Required format — exactly these columns</p>
              <ul className="flex flex-col gap-1 text-[11.5px] text-foreground/80">
                {HEADER_SPEC.map(h => (
                  <li key={h.key} className="flex items-baseline gap-2">
                    <code className="font-mono text-[11px] text-primary w-[76px] flex-shrink-0">{h.key}</code>
                    {h.req === 'required'
                      ? <span className="text-muted-foreground/60"><b className="text-amber-600">email or phone required</b> · e.g. {h.example}</span>
                      : <span className="text-muted-foreground/60">optional · e.g. {h.example}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[10.5px] text-muted-foreground/55 mt-2 leading-relaxed">
                First row must be the header. One contact per row. Only these five columns are accepted — any other column is rejected. Duplicates (by email or phone) are flagged for review before saving.
              </p>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[--border-subtle] rounded-xl py-10 cursor-pointer hover:border-primary/40 hover:bg-primary/[0.03] transition-colors">
              <UploadCloud size={26} className="text-muted-foreground/50" />
              <span className="text-[13px] font-medium text-foreground">Choose a CSV file</span>
              <span className="text-[11px] text-muted-foreground/60">or drag it here</span>
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
            </label>
            <button onClick={downloadTemplate} className="self-start flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline">
              <Download size={12} /> Download CSV template
            </button>
            {busy && <p className="text-[12px] text-muted-foreground">Reading…</p>}
            {error && <p className="text-[12px] text-rose-600">{error}</p>}
          </div>
        )}

        {/* ── Review ── */}
        {step === 'review' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
            {[...rows.map((r, i) => ({ r, i }))].sort((a, b) => order[a.r.status] - order[b.r.status]).map(({ r, i }) => (
              <RowCard key={i} r={r} onEdit={(f, v) => edit(i, f, v)} onAction={(a) => setAction(i, a)} />
            ))}
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && result && (
          <div className="py-6 flex flex-col items-center gap-2 text-center">
            <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center"><UserPlus size={20} className="text-emerald-600" /></div>
            <p className="text-[13px] font-semibold text-foreground">{result.inserted} added · {result.updated} updated</p>
            <p className="text-[11.5px] text-muted-foreground/70">{result.skipped} skipped{result.failed ? ` · ${result.failed} failed` : ''}</p>
          </div>
        )}

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={commit} disabled={busy || (willInsert + willUpdate === 0)}>
                {busy ? 'Importing…' : `Import (${willInsert} new${willUpdate ? `, ${willUpdate} update` : ''})`}
              </Button>
            </>
          )}
          {step === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── One review row ──────────────────────────────────────────────────────────
function RowCard({ r, onEdit, onAction }: { r: Row; onEdit: (f: typeof FIELDS[number], v: string) => void; onAction: (a: Action) => void }) {
  const inp = 'text-[11.5px] border border-[--border-subtle] rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/20 w-full'
  const tone = r.status === 'invalid' ? 'border-rose-200 bg-rose-50/30' : r.status === 'duplicate' ? 'border-amber-200 bg-amber-50/30' : 'border-[--border-subtle] bg-card'
  return (
    <div className={`rounded-lg border p-2.5 flex flex-col gap-2 ${tone} ${r.action === 'skip' ? 'opacity-55' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex items-center gap-1
          ${r.status === 'invalid' ? 'text-rose-700 bg-rose-100' : r.status === 'duplicate' ? 'text-amber-700 bg-amber-100' : 'text-emerald-700 bg-emerald-100'}`}>
          {r.status === 'invalid' && <AlertTriangle size={9} />}{r.status === 'duplicate' && <Copy size={9} />}
          {r.status === 'invalid' ? 'Needs email or phone' : r.status === 'duplicate' ? 'Already exists' : 'New'}
        </span>
        <div className="flex items-center gap-1">
          {r.status === 'duplicate' && (
            <>
              <ActionBtn active={r.action === 'skip'} onClick={() => onAction('skip')}>Ignore</ActionBtn>
              <ActionBtn active={r.action === 'update'} onClick={() => onAction('update')}>Overwrite</ActionBtn>
            </>
          )}
          {r.status === 'new' && (
            <>
              <ActionBtn active={r.action === 'insert'} onClick={() => onAction('insert')}>Add</ActionBtn>
              <ActionBtn active={r.action === 'skip'} onClick={() => onAction('skip')}>Ignore</ActionBtn>
            </>
          )}
          {r.status === 'invalid' && <ActionBtn active onClick={() => onAction('skip')}><X size={10} /> Skip</ActionBtn>}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {FIELDS.map(f => <input key={f} value={r[f]} placeholder={f.replace('_', ' ')} onChange={e => onEdit(f, e.target.value)} className={inp} />)}
      </div>

      {r.status === 'duplicate' && r.existing && (
        <div className="grid grid-cols-5 gap-1.5 text-[10.5px] text-muted-foreground/70 px-2">
          <span className="col-span-5 text-[9px] font-bold uppercase tracking-wider text-amber-700/60">Existing contact</span>
          <span className="truncate">{r.existing.first_name || '—'}</span>
          <span className="truncate">{r.existing.last_name || '—'}</span>
          <span className="truncate">{r.existing.email || '—'}</span>
          <span className="truncate">{r.existing.phone || '—'}</span>
          <span className="truncate">{r.existing.company || '—'}</span>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md border transition-colors
      ${active ? 'border-primary bg-primary/10 text-primary' : 'border-[--border-subtle] text-muted-foreground/70 hover:text-foreground'}`}>
      {children}
    </button>
  )
}
