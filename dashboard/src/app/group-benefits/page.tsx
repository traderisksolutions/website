'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileText, Loader2, Clock, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewQuoteWizard } from '@/components/group-benefits/NewQuoteWizard'
import { XlsxTab } from '@/components/group-benefits/XlsxTab'
import { createClient } from '@/lib/supabase/client'

// Parse a response as JSON, but degrade gracefully if the server returned plain text
// (e.g. a Vercel "Request Entity Too Large" page) instead of crashing on JSON.parse.
async function safeJson<T = Record<string, unknown>>(r: Response): Promise<T & { error?: string }> {
  const t = await r.text().catch(() => '')
  try { return (t ? JSON.parse(t) : {}) as T & { error?: string } }
  catch { return { error: t.slice(0, 160) || 'Server error' } as T & { error?: string } }
}

type RateTable = {
  id: string; insurer_name: string | null; product_code: string; product_name: string | null
  plan_year: number | null; effective_date: string | null; status: string; version: number
  source_pdf_name: string | null; created_at: string; approved_at: string | null
  calculator_filename?: string | null; rules_status?: string | null; rules_updated_at?: string | null
}
type Activity = { id: string; created_at: string; user_name: string | null; action: string; new_value: Record<string, unknown> | null }

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', extracting: 'bg-amber-100 text-amber-700',
  in_review: 'bg-blue-100 text-blue-700', approved: 'bg-emerald-100 text-emerald-700', archived: 'bg-muted text-muted-foreground/60',
}

type Tab = 'tables' | 'xlsx' | 'quote' | 'quotes' | 'activity'

export default function GroupBenefitsPage() {
  const router = useRouter()
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
    <div className="min-h-screen bg-white">
    <div className="max-w-6xl mx-auto px-8 py-6">
      <div className="mb-4 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        This is the <b>deprecated</b> Pricing Matrix (PDF rate-extraction model). The rebuilt version —
        which runs each insurer&rsquo;s own Excel calculator — lives at{' '}
        <a href="/pricing-matrix" className="underline font-medium">/pricing-matrix</a>.
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Pricing Matrix <span className="text-[12px] font-normal text-muted-foreground">(deprecated)</span></h1>
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
        {(['tables', 'xlsx', 'quote', 'quotes', 'activity'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-3.5 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === t ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground')}>
            {t === 'tables' ? 'Rate Tables' : t === 'xlsx' ? 'Calculators' : t === 'quote' ? 'New Quote' : t === 'quotes' ? 'Quotes' : 'Activity'}
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
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="data-table w-full border-collapse text-[13px]">
              <thead><tr>
                <th className="pl-4 text-left">Insurer</th><th className="text-left">Products</th><th className="text-left">Year</th><th className="text-left">Status</th><th className="text-right pr-4">Uploaded</th>
              </tr></thead>
              <tbody>
                {tables.map(t => (
                  <tr key={t.id} onClick={() => router.push(`/group-benefits/${t.id}`)} className="cursor-pointer">
                    <td className="pl-4 font-medium text-foreground whitespace-nowrap">{t.insurer_name || 'Unknown insurer'}{t.version > 1 && <span className="text-muted-foreground/50 font-normal"> · v{t.version}</span>}</td>
                    <td className="text-muted-foreground max-w-[380px] truncate">{t.product_code}</td>
                    <td className="text-muted-foreground">{t.plan_year ?? '—'}</td>
                    <td><span className={cn('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', STATUS_TONE[t.status] ?? 'bg-muted')}>{t.status.replace('_', ' ')}</span></td>
                    <td className="text-right pr-4 text-muted-foreground/70 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('en-SG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {tab === 'xlsx'     && <XlsxTab tables={tables} loading={loading} onChanged={load} />}
      {tab === 'quote'    && <NewQuoteWizard onSaved={() => { /* results shown inline; Quotes tab reloads on open */ }} />}
      {tab === 'quotes'   && <QuotesTab />}
      {tab === 'activity' && <ActivityTab />}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load() }} />}
    </div>
    </div>
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
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="data-table w-full border-collapse text-[13px]">
        <thead><tr>
          <th className="pl-4 text-left">Company</th><th className="text-left">Members</th><th className="text-left">Products</th><th className="text-left">Best price</th><th className="text-right pr-4">Created</th>
        </tr></thead>
        <tbody>
          {rows.map(q => {
            const best = [...(q.results ?? [])].sort((a, b) => a.total - b.total)[0]
            return (
              <tr key={q.id} onClick={() => router.push(`/group-benefits/quote/${q.id}`)} className="cursor-pointer">
                <td className="pl-4 font-medium text-foreground whitespace-nowrap">{q.company_name || 'Untitled'}</td>
                <td className="text-muted-foreground">{q.member_count}</td>
                <td className="text-muted-foreground max-w-[280px] truncate">{(q.product_codes ?? []).join(', ')}</td>
                <td className="text-emerald-700 font-semibold whitespace-nowrap">{best ? `${best.insurer_name} · ${best.total.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })}` : '—'}</td>
                <td className="text-right pr-4 text-muted-foreground/70 whitespace-nowrap">{new Date(q.created_at).toLocaleDateString('en-SG')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!file) { setError('Choose a PDF'); return }
    if (file.type !== 'application/pdf') { setError('File must be a PDF'); return }
    if (file.size > 25 * 1024 * 1024) { setError('PDF too large (max 25 MB)'); return }
    setBusy(true); setError(null)
    try {
      // 1. Push the PDF straight to Supabase Storage via a signed URL — bypasses the
      //    serverless request-body size limit that fails on large insurer brochures.
      const uu = await fetch('/api/group-benefits/rate-tables/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
      const ud = await safeJson<{ path?: string; token?: string }>(uu)
      if (!uu.ok || !ud.path || !ud.token) { setError(ud.error ?? 'Could not start upload'); return }
      const supabase = createClient()
      const { error: upErr } = await supabase.storage.from('group-benefits').uploadToSignedUrl(ud.path, ud.token, file, { contentType: 'application/pdf' })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); return }
      // 2. Record the uploaded object → creates the draft row.
      const cr = await fetch('/api/group-benefits/rate-tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storage_path: ud.path, filename: file.name }) })
      const cd = await safeJson<{ id?: string }>(cr)
      if (!cr.ok || !cd.id) { setError(cd.error ?? 'Upload failed'); return }
      // The review page starts extraction (single trigger) and polls for completion.
      onDone()
      router.push(`/group-benefits/${cd.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card shadow-2xl p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Upload insurer rate PDF</h3>
          <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">Insurer, product, age basis, plan year and effective date are read from the PDF — you can correct them during review.</p>
        </div>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-10 cursor-pointer hover:border-primary/40">
          <UploadCloud size={24} className="text-muted-foreground/50" />
          <span className="text-[12.5px] font-medium">{file ? file.name : 'Choose a PDF'}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
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
