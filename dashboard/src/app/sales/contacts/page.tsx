'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { Button } from '@/components/ui/button'
import { Chip, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { EmailChip } from '@/components/sales/chips'
import type { AudienceRow, AudienceSummary } from '@/lib/sales/audience'
import { RELATIONSHIP_LABEL, RELATIONSHIP_WORD, SOURCE_LABEL, n } from '@/lib/sales/labels'
import { locationLabel } from '@/lib/sales/types'

const INK = '#0f1412'
const MUTED = '#4a5550'

type Filters = { relationship: string; location: string; verifiedOnly: boolean; q: string; page: number }
type Payload = { filters: Filters; rows: AudienceRow[]; total: number; summary: AudienceSummary }

export default function ContactsPage() {
  return <Suspense fallback={null}><Contacts /></Suspense>
}

/** Every email address TRS may write to, merged into one list: prospects from the lead tool,
 *  clients and enquiries from the inbox, and imports. Rebuilt from the sources on each visit. */
function Contacts() {
  const router = useRouter()
  const search = useSearchParams()
  const filters: Filters = {
    relationship: search.get('rel') ?? 'all', location: (search.get('loc') ?? 'all').toUpperCase(),
    verifiedOnly: search.get('verified') === '1', q: search.get('q') ?? '', page: Math.max(1, Number(search.get('page')) || 1),
  }
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(filters.q)
  const [importOpen, setImportOpen] = useState(false)
  const synced = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.relationship !== 'all') p.set('rel', filters.relationship)
    if (filters.location !== 'all') p.set('loc', filters.location)
    if (filters.verifiedOnly) p.set('verified', '1')
    if (filters.q) p.set('q', filters.q)
    if (filters.page > 1) p.set('page', String(filters.page))
    if (!synced.current) { p.set('sync', '1'); synced.current = true }
    try {
      const res = await fetch(`/api/sales/contacts?${p}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.relationship, filters.location, filters.verifiedOnly, filters.q, filters.page])
  useEffect(() => { void load() }, [load])

  const go = (next: Partial<Filters>) => {
    const f = { ...filters, ...next, page: next.page ?? 1 }
    const p = new URLSearchParams()
    if (f.relationship !== 'all') p.set('rel', f.relationship)
    if (f.location !== 'all') p.set('loc', f.location)
    if (f.verifiedOnly) p.set('verified', '1')
    if (f.q) p.set('q', f.q)
    if (f.page > 1) p.set('page', String(f.page))
    router.replace(`/sales/contacts${p.size ? `?${p}` : ''}`, { scroll: false })
  }
  useEffect(() => {
    if (q.trim() === filters.q) return
    const t = setTimeout(() => go({ q: q.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const s = data?.summary
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 50))
  const locs = s ? Object.keys(s.byLocation).filter(l => l !== '—').sort() : []

  return (
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Contacts</h1>
              <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
                {!s ? 'Loading…' : <>{n(s.total)} email addresses · {n(s.verified)} verified · {n(s.suppressed)} unsubscribed or bounced · {Object.entries(s.byRelationship).map(([k, v]) => `${n(v)} ${(RELATIONSHIP_LABEL[k] ?? k).toLowerCase()}`).join(' · ')}</>}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap pb-2">
              <Button size="lg" onClick={() => setImportOpen(true)}>Import CSV</Button>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Segmented value={filters.relationship} onChange={v => go({ relationship: v })}
              options={[{ value: 'all', label: 'All', count: s?.total }, ...['prospect', 'client', 'enquiry', 'other'].filter(r => s?.byRelationship[r]).map(r => ({ value: r, label: RELATIONSHIP_LABEL[r], count: s?.byRelationship[r] }))]} />
            {locs.length > 1 && <Segmented value={filters.location} onChange={v => go({ location: v })} options={[{ value: 'all', label: 'All markets' }, ...locs.map(l => ({ value: l, label: locationLabel(l), count: s?.byLocation[l] }))]} />}
          </div>
          <div className="mt-4 pb-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid #e6e8e4' }}>
            <label className="flex items-center gap-2 text-[14px]" style={{ color: INK }}>
              <input type="checkbox" checked={filters.verifiedOnly} onChange={e => go({ verifiedOnly: e.target.checked })} className="size-4 accent-[#0f1412]" /> Verified only
            </label>
            <DataTableSearch value={q} onChange={setQ} placeholder="Search email, name or company" className="flex-shrink-0" />
          </div>
        </div>

        <ImportAudienceDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />

        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>
          <Register label="Contacts" minWidth={860} className={cn(loading && 'opacity-60')}>
            <RegisterHead>
              <RegisterTh first hint="Name and email on file">Person</RegisterTh>
              <RegisterTh>Company</RegisterTh>
              <RegisterTh hint="Client, enquiry, prospect or imported">Relationship</RegisterTh>
              <RegisterTh hint="How well the address is established">Email</RegisterTh>
              <RegisterTh last hint="Where the address came from">Sources</RegisterTh>
            </RegisterHead>
            <tbody>
              {!data ? null : data.rows.length === 0 ? <RegisterEmpty colSpan={5}>No contacts match.</RegisterEmpty> : data.rows.map(r => (
                <RegisterRow key={r.id}>
                  <RegisterCell first identityWidth={260} primary={<span className="inline-flex items-center gap-2 max-w-full"><span className="truncate min-w-0">{r.name ?? '–'}</span>{r.location && <span className="text-[11px] flex-shrink-0" style={{ color: MUTED }}>{r.location}</span>}</span>} secondary={r.email} />
                  <RegisterCell primary={r.company ?? '–'} secondary={r.title ?? undefined} />
                  <RegisterCell><Chip>{RELATIONSHIP_WORD[r.relationship] ?? r.relationship}</Chip></RegisterCell>
                  <RegisterCell><span className="inline-flex items-center gap-2"><EmailChip status={r.email_status} />{r.suppressed && <Chip>Suppressed</Chip>}</span></RegisterCell>
                  <RegisterCell last><span className="text-[13px]" style={{ color: MUTED }}>{r.sources.map(SOURCE_LABEL).join(', ')}</span></RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
          {data && (
            <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: MUTED }}>
              <p className="m-0 tabular-nums">{loading ? 'Loading…' : `${n(total)} contacts`}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => go({ page: filters.page - 1 })}>Previous</Button>
                <span className="tabular-nums px-1">Page {filters.page} of {n(pages)}</span>
                <Button variant="outline" size="sm" disabled={filters.page >= pages} onClick={() => go({ page: filters.page + 1 })}>Next</Button>
              </div>
            </nav>
          )}
        </div>
      </AppMainPanel>
    </AppSplitLayout>
  )
}

function ImportAudienceDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const [csv, setCsv] = useState('')
  const [label, setLabel] = useState('')
  const [relationship, setRelationship] = useState('other')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Import contacts</DialogTitle>
          <DialogDescription className="text-[14px]" style={{ color: MUTED }}>Header row with email, and optionally name, company, title, country. Known addresses keep their stronger relationship.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Import name, e.g. Event list" maxLength={40} aria-label="Import name" className={inputCls} />
            <select value={relationship} onChange={e => setRelationship(e.target.value)} aria-label="These people are" className={inputCls}>
              <option value="other">Other contacts</option><option value="prospect">Prospects</option><option value="client">Clients</option><option value="enquiry">Enquiries</option>
            </select>
          </div>
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); if (!label) setLabel(f.name.replace(/\.csv$/i, '')) } }} />
          <div><Button variant="outline" size="sm" onClick={() => file.current?.click()}>Choose file</Button></div>
          <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} placeholder={'email,name,company,title,country\njane@acme.com,Jane Tan,Acme,CEO,Singapore'} aria-label="CSV" className={`${textareaCls} font-mono text-[12px]`} />
          {msg && <p className="m-0 text-[13px]" style={{ color: MUTED }} aria-live="polite">{msg}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button disabled={busy || !csv.trim()} onClick={async () => {
            setBusy(true); setMsg('')
            try {
              const res = await fetch('/api/sales/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv, label: label || 'csv', relationship }) })
              const j = await res.json().catch(() => ({}))
              if (!res.ok) { setMsg(j.error ?? 'Import failed'); return }
              setMsg(`${n(j.added)} added · ${n(j.updated)} already known · ${n(j.invalid)} invalid`)
              setCsv(''); onImported()
            } finally { setBusy(false) }
          }}>{busy ? 'Importing…' : 'Import'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
