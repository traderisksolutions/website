'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Chip, Segmented, inputCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import { UploadCloud } from 'lucide-react'

const INK = '#202124'
const MUTED = '#5f6368'

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
      if (parsed.length < 2) { setError('The file has no data rows. Add at least one contact below the header row.'); return }

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
      <DialogContent className="sm:max-w-[860px] max-h-[88vh] overflow-hidden flex flex-col" style={{ color: INK }}>
        <DialogHeader>
          <DialogTitle className="text-[20px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Import contacts from CSV</DialogTitle>
          <DialogDescription className="text-[14px]" style={{ color: MUTED }}>
            {step === 'upload' && 'Upload a CSV in the template format. Duplicates and rows to fix are flagged before anything is saved.'}
            {step === 'review' && `${counts.new} new · ${counts.dup} duplicate · ${counts.invalid} to fix`}
            {step === 'done' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload ── */}
        {step === 'upload' && (
          <div className="flex flex-col gap-4 py-1">
            {/* Explicit header spec — strict: exactly these columns, nothing else. */}
            <div className="rounded-[16px] px-5 py-4" style={{ background: '#f1f3f4' }}>
              <p className="m-0 text-[14px] font-medium mb-2.5" style={{ color: INK }}>Accepted columns</p>
              <ul className="m-0 p-0 list-none flex flex-col gap-1.5 text-[13px]" style={{ color: '#3c4043' }}>
                {HEADER_SPEC.map(h => (
                  <li key={h.key} className="flex items-baseline gap-3">
                    <code className="font-mono text-[12.5px] w-[84px] flex-shrink-0" style={{ color: INK }}>{h.key}</code>
                    <span style={{ color: MUTED }}>{h.req === 'required' ? 'email or phone required' : 'optional'} · e.g. {h.example}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-3 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
                First row is the header. One contact per row. Other columns are rejected. Duplicates by email or phone are flagged before saving.
              </p>
            </div>

            <label className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] py-10 cursor-pointer hover:bg-[#f8f9fa] transition-colors" style={{ border: '1px dashed #dadce0' }}>
              <UploadCloud size={22} style={{ color: '#9aa0a6' }} />
              <span className="text-[14px] font-medium" style={{ color: INK }}>Choose a CSV file</span>
              <span className="text-[12.5px]" style={{ color: MUTED }}>or drop it here</span>
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
            </label>
            <button type="button" onClick={downloadTemplate} className="self-start text-[13.5px] bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>
              Download CSV template
            </button>
            {busy && <p className="m-0 text-[13px]" style={{ color: MUTED }}>Reading…</p>}
            {error && <p className="m-0 text-[13px]" style={{ color: MUTED }}>{error}</p>}
          </div>
        )}

        {/* ── Review ── */}
        {step === 'review' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
            {[...rows.map((r, i) => ({ r, i }))].sort((a, b) => order[a.r.status] - order[b.r.status]).map(({ r, i }) => (
              <RowCard key={i} r={r} onEdit={(f, v) => edit(i, f, v)} onAction={(a) => setAction(i, a)} />
            ))}
            {error && <p className="m-0 text-[13px]" style={{ color: MUTED }}>{error}</p>}
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && result && (
          <div className="py-8 flex flex-col items-center gap-1 text-center">
            <p className="m-0 text-[16px] font-medium" style={{ color: INK }}>{result.inserted} added · {result.updated} updated</p>
            <p className="m-0 text-[13px]" style={{ color: MUTED }}>{result.skipped} skipped{result.failed ? ` · ${result.failed} failed` : ''}</p>
          </div>
        )}

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={commit} disabled={busy || (willInsert + willUpdate === 0)}>
                {busy ? 'Importing…' : `Import ${willInsert} new${willUpdate ? `, update ${willUpdate}` : ''}`}
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
  const inp = cn(inputCls, 'h-9 text-[13px] px-3')
  const label = r.status === 'invalid' ? 'Needs email or phone' : r.status === 'duplicate' ? 'Already exists' : 'New'
  return (
    <div className={cn('rounded-[12px] p-3 flex flex-col gap-2.5 bg-white', r.action === 'skip' && 'opacity-60')} style={{ border: '1px solid #e8eaed' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Chip>{label}</Chip>
        <div className="flex items-center gap-1">
          {r.status === 'duplicate' && (
            <Segmented<Action> value={r.action} onChange={onAction} options={[{ value: 'skip', label: 'Ignore' }, { value: 'update', label: 'Overwrite' }]} />
          )}
          {r.status === 'new' && (
            <Segmented<Action> value={r.action} onChange={onAction} options={[{ value: 'insert', label: 'Add' }, { value: 'skip', label: 'Ignore' }]} />
          )}
          {r.status === 'invalid' && (
            <Segmented<Action> value="skip" onChange={onAction} options={[{ value: 'skip', label: 'Skip' }]} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {FIELDS.map(f => <input key={f} value={r[f]} placeholder={f.replace('_', ' ')} aria-label={f.replace('_', ' ')} onChange={e => onEdit(f, e.target.value)} className={inp} />)}
      </div>

      {r.status === 'duplicate' && r.existing && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[12.5px] px-1" style={{ color: MUTED }}>
          <span className="col-span-2 sm:col-span-5 text-[12px]" style={{ color: '#80868b' }}>Existing contact</span>
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
