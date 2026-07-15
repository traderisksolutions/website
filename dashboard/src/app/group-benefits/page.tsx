'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileText, Loader2, Clock, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewQuoteWizard } from '@/components/group-benefits/NewQuoteWizard'

type RateTable = {
  id: string; insurer_name: string | null; product_code: string; product_name: string | null
  plan_year: number | null; effective_date: string | null; status: string; version: number
  source_pdf_name: string | null; created_at: string; approved_at: string | null
}
type Insurer = { id: string; name: string }
type Activity = { id: string; created_at: string; user_name: string | null; action: string; new_value: Record<string, unknown> | null }

const PRODUCTS = [
  { code: 'GHS', label: 'GHS — Hospital & Surgical' },
  { code: 'GOC', label: 'GOC — Outpatient Clinical' },
  { code: 'GOS', label: 'GOS — Outpatient Specialist' },
  { code: 'OTHER', label: 'Other' },
]
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', extracting: 'bg-amber-100 text-amber-700',
  in_review: 'bg-blue-100 text-blue-700', approved: 'bg-emerald-100 text-emerald-700', archived: 'bg-muted text-muted-foreground/60',
}

type Tab = 'tables' | 'quote' | 'quotes' | 'activity'

export default function GroupBenefitsPage() {
  const [tab, setTab]   = useState<Tab>('tables')
  const [tables, setTables] = useState<RateTable[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/group-benefits/rate-tables', { cache: 'no-store' })
    setTables(res.ok ? await res.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Pricing Matrix</h1>
          <p className="text-sm text-muted-foreground mt-1">Insurer rate matrices — upload a PDF, extract with 3 agents + Opus judge, review, approve.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('quote')} className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5">
            <Calculator size={15} /> New quote
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <UploadCloud size={15} /> Upload rate PDF
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border mb-5">
        {(['tables', 'quote', 'quotes', 'activity'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-3.5 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === t ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground')}>
            {t === 'tables' ? 'Rate Tables' : t === 'quote' ? 'New Quote' : t === 'quotes' ? 'Quotes' : 'Activity'}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        loading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : tables.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText size={28} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No rate tables yet. Upload an insurer rate PDF to begin.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tables.map(t => <TableRow key={t.id} t={t} />)}
          </div>
        )
      )}
      {tab === 'quote'    && <NewQuoteWizard onSaved={() => { /* results shown inline; Quotes tab reloads on open */ }} />}
      {tab === 'quotes'   && <QuotesTab />}
      {tab === 'activity' && <ActivityTab />}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load() }} />}
    </div>
  )
}

function TableRow({ t }: { t: RateTable }) {
  const router = useRouter()
  return (
    <button onClick={() => router.push(`/group-benefits/${t.id}`)}
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02] text-left transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-foreground truncate">{t.insurer_name || 'Unknown insurer'}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">{t.product_code}</span>
          {t.version > 1 && <span className="text-[10px] text-muted-foreground">v{t.version}</span>}
        </div>
        <p className="text-[11.5px] text-muted-foreground/70 truncate mt-0.5">
          {t.source_pdf_name}{t.plan_year ? ` · ${t.plan_year}` : ''}{t.effective_date ? ` · eff ${t.effective_date}` : ''}
        </p>
      </div>
      <span className={cn('flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', STATUS_TONE[t.status] ?? 'bg-muted')}>
        {t.status.replace('_', ' ')}
      </span>
    </button>
  )
}

type Quote = { id: string; company_name: string | null; effective_date: string | null; product_codes: string[]; member_count: number; results: { insurer_name: string; total: number }[]; created_at: string }

function QuotesTab() {
  const router = useRouter()
  const [rows, setRows] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/group-benefits/quote', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then((d) => { setRows(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No quotes yet. Use “New Quote” to run a census.</p>
  return (
    <div className="flex flex-col gap-2">
      {rows.map(q => {
        const best = [...(q.results ?? [])].sort((a, b) => a.total - b.total)[0]
        return (
          <button key={q.id} onClick={() => router.push(`/group-benefits/quote/${q.id}`)}
            className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-[12.5px] text-left hover:border-primary/40 hover:bg-primary/[0.02] transition-colors">
            <div className="min-w-0">
              <span className="font-semibold text-foreground">{q.company_name || 'Untitled'}</span>
              <span className="text-muted-foreground/60"> · {q.member_count} members · {(q.product_codes ?? []).join('/')}</span>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">{new Date(q.created_at).toLocaleString('en-SG')}{q.effective_date ? ` · eff ${q.effective_date}` : ''}</p>
            </div>
            {best && <span className="text-[12px] text-emerald-700 font-semibold flex-shrink-0">Best: {best.insurer_name} {best.total.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ActivityTab() {
  const [rows, setRows] = useState<Activity[]>([])
  useEffect(() => {
    fetch('/api/activity?resource_type=gb_rate_table&limit=100', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : []).then(setRows).catch(() => {})
  }, [])
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(r => (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-card text-[12px]">
          <Clock size={12} className="text-muted-foreground/40 flex-shrink-0" />
          <span className="font-medium text-foreground/80">{r.action.replace('gb.', '').replace(/_/g, ' ')}</span>
          <span className="text-muted-foreground/60 truncate flex-1">{r.new_value ? JSON.stringify(r.new_value) : ''}</span>
          <span className="text-muted-foreground/50 flex-shrink-0">{r.user_name ?? ''} · {new Date(r.created_at).toLocaleString('en-SG')}</span>
        </div>
      ))}
    </div>
  )
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter()
  const [insurers, setInsurers] = useState<Insurer[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [insurerId, setInsurerId] = useState('')
  const [insurerName, setInsurerName] = useState('')
  const [product, setProduct] = useState('GHS')
  const [planYear, setPlanYear] = useState('')
  const [effDate, setEffDate] = useState('')
  const [ageBasis, setAgeBasis] = useState('next_birthday')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/insurers', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then((rows: Insurer[]) => setInsurers(Array.isArray(rows) ? rows : [])).catch(() => {})
  }, [])

  async function submit() {
    if (!file) { setError('Choose a PDF'); return }
    setBusy(true); setError(null)
    try {
      const fd = new FormData()
      fd.set('file', file); fd.set('product_code', product); fd.set('age_basis', ageBasis)
      if (insurerId) { fd.set('insurer_id', insurerId); fd.set('insurer_name', insurers.find(i => i.id === insurerId)?.name ?? '') }
      else if (insurerName) fd.set('insurer_name', insurerName)
      if (planYear) fd.set('plan_year', planYear)
      if (effDate) fd.set('effective_date', effDate)
      const up = await fetch('/api/group-benefits/rate-tables', { method: 'POST', body: fd })
      const d = await up.json()
      if (!up.ok || !d.id) { setError(d.error ?? 'Upload failed'); return }
      // The review page starts extraction (single trigger) and polls for completion.
      onDone()
      router.push(`/group-benefits/${d.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  const inp = 'w-full text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card shadow-2xl p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold text-foreground">Upload insurer rate PDF</h3>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-8 cursor-pointer hover:border-primary/40">
          <UploadCloud size={22} className="text-muted-foreground/50" />
          <span className="text-[12.5px] font-medium">{file ? file.name : 'Choose a PDF'}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <label className="text-[11px] font-semibold text-muted-foreground/70">Insurer</label>
            <select value={insurerId} onChange={e => setInsurerId(e.target.value)} className={inp}>
              <option value="">— pick from directory —</option>
              {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {!insurerId && <input value={insurerName} onChange={e => setInsurerName(e.target.value)} placeholder="…or type insurer name" className={`${inp} mt-1.5`} />}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground/70">Product</label>
            <select value={product} onChange={e => setProduct(e.target.value)} className={inp}>{PRODUCTS.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground/70">Age basis</label>
            <select value={ageBasis} onChange={e => setAgeBasis(e.target.value)} className={inp}>
              <option value="next_birthday">Age next birthday</option>
              <option value="last_birthday">Age last birthday</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground/70">Plan year</label>
            <input value={planYear} onChange={e => setPlanYear(e.target.value)} placeholder="2026" className={inp} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground/70">Effective date</label>
            <input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={inp} />
          </div>
        </div>
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} className="text-[13px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={busy || !file} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Uploading…' : 'Upload & extract'}
          </button>
        </div>
      </div>
    </div>
  )
}
