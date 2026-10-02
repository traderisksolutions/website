'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, FileText, Loader2, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

/**
 * Pricing Matrix: every insurer's calculator, in Home's design system. One line on what the
 * page is, the views as text, then the register: insurer over version and status, files,
 * effective date, status in words, added. A row opens the calculator. Quotes, coverage
 * comparison and terminology are the other views.
 */

type Calc = {
  id: string; insurer_name: string | null; label: string | null
  xlsx_filename: string | null; brochure_filename: string | null
  effective_date: string | null; version: number; status: string
  created_at: string; approved_at: string | null
  change_summary: { text?: string } | null
}
const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const STATUS_LABEL: Record<string, string> = { approved: 'Approved', in_review: 'In review', extracting: 'Extracting', draft: 'Draft', error: 'Needs attention', archived: 'Archived' }

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

export default function PricingMatrixPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Calc[]>([])
  const [pendingTerms, setPendingTerms] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    const [calcRes, termsRes] = await Promise.all([fetch('/api/pricing-matrix/calculators', { cache: 'no-store' }), fetch('/api/pricing-matrix/taxonomy/synonyms?status=pending', { cache: 'no-store' })])
    setRows(calcRes.ok ? await calcRes.json() : [])
    setPendingTerms(termsRes.ok ? (await termsRes.json()).length : 0)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const [deletingId, setDeletingId] = useState<string | null>(null)
  async function del(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? Quotes already generated keep their saved numbers.`)) return
    setDeletingId(id)
    try { await fetch(`/api/pricing-matrix/calculators/${id}`, { method: 'DELETE' }) } finally { setDeletingId(null); load() }
  }
  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r => !needle || [r.insurer_name ?? '', r.label ?? '', r.xlsx_filename ?? ''].join(' ').toLowerCase().includes(needle))
  const approved = rows.filter(r => r.status === 'approved').length
  const inReview = rows.filter(r => r.status === 'in_review' || r.status === 'extracting').length

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-[640px]">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Pricing Matrix</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>Each insurer's own calculator, mapped once. A quote runs the insurer's formulas on a census; nothing is re-typed.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search insurers" aria-label="Search calculators" className="h-12 w-[220px] rounded-[12px] border bg-white px-4 text-[15px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0' }} />
            <Link href="/pricing-matrix/quote/new" className="h-12 px-5 rounded-[12px] bg-white text-[15px] border no-underline inline-flex items-center hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>New quote</Link>
            <button type="button" onClick={() => setShowUpload(true)} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90" style={{ background: INK }}>Add calculator</button>
          </div>
        </div>

        <nav className="mt-8" aria-label="Views" style={{ borderBottom: `1px solid ${RULE}` }}>
          <ul className="m-0 p-0 list-none flex items-center gap-7">
            {[['/pricing-matrix', 'Calculators', true], ['/pricing-matrix/quote', 'Quotes', false], ['/pricing-matrix/compare', 'Compare coverage', false], ['/pricing-matrix/taxonomy', `Terminology${pendingTerms ? ` ${pendingTerms}` : ''}`, false]].map(([href, label, on]) => (
              <li key={String(href)}><Link href={String(href)} aria-current={on ? 'page' : undefined} className={cn('relative block pb-3 text-[15px] no-underline', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>{String(label)}<span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden /></Link></li>
            ))}
          </ul>
        </nav>

        <section className="mt-6 rounded-[20px] px-7 py-6" style={{ background: '#EAF2FF' }} aria-label="What's new">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>What's new</p>
          <h2 className="m-0 mt-2 text-[22px] font-medium tracking-[-0.02em]">Pricing Matrix 2.0 is being built.</h2>
          <ul className="m-0 mt-3 pl-5 text-[14.5px] leading-relaxed flex flex-col gap-1" style={{ color: '#3c4043' }}>
            <li><b className="font-medium" style={{ color: INK }}>Now:</b> upload a client's employee list as a spreadsheet, map its columns once, and rows that cannot be priced are flagged before any insurer is run.</li>
            <li><b className="font-medium" style={{ color: INK }}>Now:</b> tiers per job grade (Director, Manager, Staff) re-price live as you change them.</li>
            <li><b className="font-medium" style={{ color: INK }}>Next:</b> a value column — benefit limit per premium dollar — so price, premium and payout sit side by side and sort.</li>
            <li><b className="font-medium" style={{ color: INK }}>Then:</b> saved scenarios exported side by side, a recommendation that cites its numbers, and the chosen quote becoming the debit note and policy without retyping.</li>
          </ul>
        </section>

        <p className="m-0 mt-6 mb-3 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{loading ? 'Loading…' : `${rows.length} calculator${rows.length === 1 ? '' : 's'} · ${approved} approved · ${inReview} in review${pendingTerms ? ` · ${pendingTerms} terms to map` : ''}`}</p>

        {loading ? (
          <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[60px] px-6 flex items-center" style={{ borderBottom: `1px solid ${RULE}` }}><span className="h-3.5 w-48 rounded bg-[#f1f3f4] animate-pulse" /></div>)}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-[20px] px-8 py-14 text-center" style={{ background: '#F5F5F3' }}>
            <p className="m-0 text-[20px] font-medium">No calculators yet</p>
            <p className="m-0 mt-2 text-[14.5px]" style={{ color: MUTED }}>Add an insurer's Excel calculator and brochure to begin.</p>
            <button type="button" onClick={() => setShowUpload(true)} className="mt-5 h-11 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer" style={{ background: INK }}>Add calculator</button>
          </div>
        ) : (
          <Register label="Calculators" minWidth={880}>
            <RegisterHead>
              <RegisterTh first width={300}>Insurer</RegisterTh>
              <RegisterTh>Calculator</RegisterTh>
              <RegisterTh>Brochure</RegisterTh>
              <RegisterTh align="right">Effective</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh align="right">Added</RegisterTh>
              <RegisterTh last align="right"><span className="sr-only">Actions</span></RegisterTh>
            </RegisterHead>
            <tbody>
              {shown.map(r => {
                const name = r.insurer_name || r.label || 'Untitled'
                return (
                  <RegisterRow key={r.id} onClick={() => router.push(`/pricing-matrix/${r.id}`)}>
                    <RegisterCell first primary={name} secondary={`v${r.version}${r.change_summary?.text ? ' · changed' : ''} · ${STATUS_LABEL[r.status] ?? r.status}`} title={r.change_summary?.text ?? name} />
                    <RegisterCell className="max-w-[240px]">
                      <span className="inline-flex items-center gap-1.5 text-[14px] max-w-full" style={{ color: '#3c4043' }}><FileSpreadsheet size={14} className="shrink-0" style={{ color: '#9aa0a6' }} /><span className="truncate" title={r.xlsx_filename ?? undefined}>{r.xlsx_filename || '—'}</span></span>
                    </RegisterCell>
                    <RegisterCell className="max-w-[240px]">
                      {r.brochure_filename ? <span className="inline-flex items-center gap-1.5 text-[14px] max-w-full" style={{ color: '#3c4043' }}><FileText size={14} className="shrink-0" style={{ color: '#9aa0a6' }} /><span className="truncate" title={r.brochure_filename}>{r.brochure_filename}</span></span> : <span className="text-[14px]" style={{ color: '#9aa0a6' }}>No brochure</span>}
                    </RegisterCell>
                    <RegisterCell align="right" primary={r.effective_date ?? '—'} secondary={r.effective_date ? 'rates effective' : 'no effective date'} />
                    <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{STATUS_LABEL[r.status] ?? r.status}</span></RegisterCell>
                    <RegisterCell align="right" primary={new Date(r.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })} secondary={r.approved_at ? `approved ${new Date(r.approved_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : 'not yet approved'} />
                    <RegisterCell last align="right">
                      <span className="inline-flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Link href={`/pricing-matrix/${r.id}`} onClick={e => e.stopPropagation()} className="inline-flex items-center h-8 px-3 rounded-[10px] bg-white text-[13px] border no-underline hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>Open</Link>
                        <button type="button" onClick={() => del(r.id, name)} disabled={deletingId === r.id} aria-label={`Delete ${name}`} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] bg-white text-[13px] border cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>{deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}Delete</button>
                      </span>
                    </RegisterCell>
                  </RegisterRow>
                )
              })}
              {shown.length === 0 && <RegisterEmpty colSpan={7}>No calculators match.</RegisterEmpty>}
            </tbody>
          </Register>
        )}
      </div>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={load} />}
    </div>
  )
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter()
  const [xlsx, setXlsx] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  // Picked from Companies → Insurers, never typed, so the insurer list cannot fork again.
  const [insurer, setInsurer] = useState('')
  const [insurers, setInsurers] = useState<{ id: string; name: string }[]>([])
  useEffect(() => { fetch('/api/insurers', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => setInsurers(Array.isArray(rows) ? rows : [])).catch(() => {}) }, [])
  const [effDate, setEffDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])

  async function uploadOne(file: File, kind: 'xlsx' | 'pdf'): Promise<string> {
    const uu = await fetch('/api/pricing-matrix/calculators/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, kind }) })
    const ud = await safeJson<{ path?: string; token?: string }>(uu)
    if (!uu.ok || !ud.path || !ud.token) throw new Error(ud.error ?? 'Could not start upload')
    const supabase = createClient()
    const ct = kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const { error: upErr } = await supabase.storage.from('group-benefits').uploadToSignedUrl(ud.path, ud.token, file, { contentType: ct })
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
    return ud.path
  }
  async function submit() {
    if (!xlsx) { setError('Choose the calculator .xlsx'); return }
    if (!xlsx.name.match(/\.(xlsx|xlsm|xls)$/i)) { setError('The calculator must be an Excel file (.xlsx, .xlsm or .xls)'); return }
    setBusy(true); setError(null)
    try {
      setStatus('Uploading calculator…')
      const xlsx_path = await uploadOne(xlsx, 'xlsx')
      let brochure_path: string | undefined
      if (pdf) { setStatus('Uploading brochure…'); brochure_path = await uploadOne(pdf, 'pdf') }
      setStatus('Creating…')
      const cr = await fetch('/api/pricing-matrix/calculators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_path, xlsx_filename: xlsx.name, brochure_path, brochure_filename: pdf?.name, insurer_company_id: insurer || null, effective_date: effDate || null }) })
      const cd = await safeJson<{ id?: string }>(cr)
      if (!cr.ok || !cd.id) { setError(cd.error ?? 'Create failed'); return }
      onDone()
      router.push(`/pricing-matrix/${cd.id}?automap=1`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') } finally { setBusy(false); setStatus(null) }
  }
  const drop = 'flex flex-col items-center justify-center gap-1.5 rounded-[12px] py-7 px-3 min-w-0 cursor-pointer text-center hover:bg-[#e8eaed]'
  const inp = 'h-10 rounded-[10px] border bg-white px-3.5 text-[14px] outline-none focus:border-[#202124]'
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" style={{ background: 'rgba(32,33,36,0.28)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-calc" className="w-full max-w-[560px] rounded-[16px] bg-white p-6" style={{ boxShadow: '0 24px 64px rgba(32,33,36,0.2)', color: INK }}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="add-calc" className="m-0 text-[20px] font-medium">Add insurer calculator</h2><p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>The Excel calculator is required. The brochure is optional and feeds wordings and recommendations.</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={16} /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className={drop} style={{ background: '#F1F3F4' }}><FileSpreadsheet size={20} style={{ color: '#3c4043' }} /><span className="text-[13px] font-medium max-w-full truncate" title={xlsx?.name}>{xlsx ? xlsx.name : 'Calculator .xlsx'}</span><span className="text-[12px]" style={{ color: MUTED }}>Required</span><input type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e => setXlsx(e.target.files?.[0] ?? null)} /></label>
          <label className={drop} style={{ background: '#F1F3F4' }}><FileText size={20} style={{ color: '#3c4043' }} /><span className="text-[13px] font-medium max-w-full truncate" title={pdf?.name}>{pdf ? pdf.name : 'Brochure .pdf'}</span><span className="text-[12px]" style={{ color: MUTED }}>Optional</span><input type="file" accept="application/pdf" className="hidden" onChange={e => setPdf(e.target.files?.[0] ?? null)} /></label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <select id="calc-insurer" value={insurer} onChange={e => setInsurer(e.target.value)} aria-label="Insurer" className={inp} style={{ borderColor: '#dadce0', color: insurer ? INK : MUTED }}>
            <option value="">Choose an insurer…</option>
            {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input value={effDate} onChange={e => setEffDate(e.target.value)} type="date" aria-label="Rate effective date" className={inp} style={{ borderColor: '#dadce0' }} />
        </div>
        {error && <p className="m-0 mt-3 text-[13px]" style={{ color: '#3c4043' }}>{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          {status && <span className="text-[13px] mr-auto inline-flex items-center gap-1.5" style={{ color: MUTED }}><Loader2 size={13} className="animate-spin" />{status}</span>}
          <button type="button" onClick={onClose} className="h-10 px-3.5 rounded-[10px] text-[14px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || !xlsx} className="h-10 px-5 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>{busy ? 'Working…' : 'Upload and map'}</button>
        </div>
      </div>
    </div>
  )
}
