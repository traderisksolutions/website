'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UploadCloud, Loader2, Clock, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewQuoteWizard } from '@/components/group-benefits/NewQuoteWizard'
import { XlsxTab } from '@/components/group-benefits/XlsxTab'
import { SourceFilesTab } from '@/components/group-benefits/SourceFilesTab'
import { VERIFICATION, verificationOf } from '@/lib/gb/verification'
import { createClient } from '@/lib/supabase/client'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'

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
  verification?: { status?: string; basis?: string } | null
}
type Activity = { id: string; created_at: string; user_name: string | null; action: string; new_value: Record<string, unknown> | null }

// Every status is the same neutral chip; the label carries the meaning.
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', extracting: 'Extracting', in_review: 'In review', approved: 'Approved', archived: 'Archived' }
const CHIP = 'inline-flex items-center rounded-[6px] bg-[#f1f3f4] text-[#3c4043] text-[11.5px] font-medium px-2 py-0.5 whitespace-nowrap'

type Tab = 'tables' | 'sources' | 'xlsx' | 'quote' | 'quotes' | 'activity'

/**
 * Pricing Matrix — one module since 2 Oct 2026.
 *
 * There used to be two: this one (then "Group Benefits") holding every insurer, rate and quote, and
 * an older /pricing-matrix that by then held none — no calculators, no rates, no quotes. The empty
 * one was deleted and this one took its name and address; /group-benefits redirects here.
 *
 * ?tab=quote&company=<name> opens the quote wizard for a client, which is how the company page's
 * "New quotation" button arrives.
 */
export default function PricingMatrixPage() {
  return <Suspense fallback={null}><PricingMatrix /></Suspense>
}

function PricingMatrix() {
  const router = useRouter()
  const params = useSearchParams()
  const initialTab = (['tables', 'sources', 'xlsx', 'quote', 'quotes', 'activity'] as const).find(t => t === params.get('tab')) ?? 'tables'
  const company = params.get('company') ?? undefined
  const [tab, setTab]   = useState<Tab>(initialTab)
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
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: '#202124' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[640px]">
          <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Pricing Matrix</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setTab('quote')} className="h-12 px-5 rounded-[12px] bg-white text-[15px] border border-[#dadce0] text-[#202124] inline-flex items-center gap-2 cursor-pointer hover:bg-[#f8f9fa]">
            <Calculator size={15} /> New quote
          </button>
          <button onClick={() => setShowUpload(true)} className="h-12 px-6 rounded-[12px] bg-[#202124] text-white text-[15px] font-medium border-0 inline-flex items-center gap-2 cursor-pointer hover:opacity-90">
            <UploadCloud size={15} /> Upload rate PDF
          </button>
        </div>
      </div>

      {/* Six tabs do not fit a phone: the bar scrolls sideways on its own instead of widening the page. */}
      <div className="mt-8 mb-6 flex items-center gap-7 overflow-x-auto" style={{ borderBottom: '1px solid #e8eaed' }}>
        {(['tables', 'sources', 'xlsx', 'quote', 'quotes', 'activity'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('relative pb-3 text-[15px] bg-transparent border-0 p-0 cursor-pointer whitespace-nowrap flex-shrink-0', tab === t ? 'font-medium text-[#202124]' : 'text-[#5f6368] hover:text-[#202124]')}>
            {t === 'tables' ? 'Rate tables' : t === 'sources' ? 'Source files' : t === 'xlsx' ? 'Calculators' : t === 'quote' ? 'New quote' : t === 'quotes' ? 'Quotes' : 'Activity'}
            {tab === t && <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-[#202124]" aria-hidden />}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        loading ? <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#5f6368' }}>Loading…</p>
        : tables.length === 0 ? (
          <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#5f6368' }}>No rate tables yet. Upload an insurer rate PDF to begin.</p>
        ) : (
          <Register label="Rate tables" minWidth={920}>
            <RegisterHead>
              <RegisterTh first width={280}>Insurer</RegisterTh>
              <RegisterTh>Products</RegisterTh>
              <RegisterTh align="right">Year</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh>Rates</RegisterTh>
              <RegisterTh last align="right">Uploaded</RegisterTh>
            </RegisterHead>
            <tbody>
              {tables.map(t => (
                <RegisterRow key={t.id} onClick={() => router.push(`/pricing-matrix/${t.id}`)}>
                  <RegisterCell first primary={t.insurer_name || 'Unknown insurer'} secondary={t.version > 1 ? `Version ${t.version}` : t.source_pdf_name ?? 'Version 1'} />
                  <RegisterCell className="max-w-[260px]"><span className="block text-[14px] truncate" style={{ color: '#3c4043' }} title={t.product_code}>{t.product_code}</span></RegisterCell>
                  <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: t.plan_year ? '#202124' : '#9aa0a6' }}>{t.plan_year ?? '—'}</span></RegisterCell>
                  <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{STATUS_LABEL[t.status] ?? t.status}</span></RegisterCell>
                  <RegisterCell>{(() => { const v = verificationOf({ verification: t.verification }); return <span className={CHIP} style={{ color: VERIFICATION[v.status].color }} title={v.basis ?? undefined}>{VERIFICATION[v.status].label}</span> })()}</RegisterCell>
                  <RegisterCell last align="right" primary={new Date(t.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })} secondary={t.approved_at ? `approved ${new Date(t.approved_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : 'not yet approved'} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )
      )}
      {tab === 'xlsx'     && <XlsxTab tables={tables} loading={loading} onChanged={load} />}
      {tab === 'quote'    && <NewQuoteWizard initialCompany={company} onSaved={() => { /* results shown inline; Quotes tab reloads on open */ }} />}
      {tab === 'quotes'   && <QuotesTab />}
      {tab === 'sources' && <SourceFilesTab />}
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
  if (loading) return <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#5f6368' }}>Loading…</p>
  if (rows.length === 0) return <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#5f6368' }}>No quotes yet. Run a census under New quote.</p>
  return (
    <Register label="Quotes" minWidth={760}>
      <RegisterHead>
        <RegisterTh first width={260}>Company</RegisterTh>
        <RegisterTh align="right">Members</RegisterTh>
        <RegisterTh>Products</RegisterTh>
        <RegisterTh align="right">Lowest premium</RegisterTh>
        <RegisterTh last align="right">Created</RegisterTh>
      </RegisterHead>
      <tbody>
        {rows.map(q => {
          const best = [...(q.results ?? [])].sort((a, b) => a.total - b.total)[0]
          return (
            <RegisterRow key={q.id} onClick={() => router.push(`/pricing-matrix/quote/${q.id}`)}>
              <RegisterCell first primary={q.company_name || 'Untitled'} secondary={q.effective_date ? `effective ${q.effective_date}` : 'no effective date'} />
              <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: '#202124' }}>{q.member_count}</span></RegisterCell>
              <RegisterCell className="max-w-[280px]"><span className="block text-[14px] truncate" style={{ color: '#3c4043' }} title={(q.product_codes ?? []).join(', ')}>{(q.product_codes ?? []).join(', ') || '—'}</span></RegisterCell>
              {best ? <RegisterCell align="right" primary={best.total.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })} secondary={best.insurer_name} /> : <RegisterCell align="right"><span style={{ color: '#9aa0a6' }}>—</span></RegisterCell>}
              <RegisterCell last align="right"><span className="text-[14px] tabular-nums" style={{ color: '#5f6368' }}>{new Date(q.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span></RegisterCell>
            </RegisterRow>
          )
        })}
      </tbody>
    </Register>
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
        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-[13.5px]" style={{ borderBottom: '1px solid #e8eaed' }}>
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
      router.push(`/pricing-matrix/${cd.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[16px] bg-white p-6 flex flex-col gap-3" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)' }} onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="m-0 text-[20px] font-medium tracking-[-0.01em] text-foreground">Upload insurer rate PDF</h3>
          <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">Insurer, product, age basis, plan year and effective date are read from the PDF — you can correct them during review.</p>
        </div>
        <label className="flex flex-col items-center justify-center gap-2 rounded-[12px] py-10 cursor-pointer bg-[#f1f3f4] hover:bg-[#e8eaed]">
          <UploadCloud size={24} className="text-muted-foreground/50" />
          <span className="text-[12.5px] font-medium">{file ? file.name : 'Choose a PDF'}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="text-[12px] text-[#c5221f]">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} className="h-10 px-3.5 rounded-[10px] text-[14px] bg-transparent border-0 hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={submit} disabled={busy || !file} className="flex items-center gap-1.5 h-10 px-5 rounded-[10px] text-[14px] font-medium bg-[#202124] text-white hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Uploading…' : 'Upload and extract'}
          </button>
        </div>
      </div>
    </div>
  )
}
