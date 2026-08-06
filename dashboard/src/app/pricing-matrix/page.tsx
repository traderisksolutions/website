'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, FileText, Loader2, Plus, X, Calculator, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Calc = {
  id: string; insurer_name: string | null; label: string | null
  xlsx_filename: string | null; brochure_filename: string | null
  effective_date: string | null; version: number; status: string
  created_at: string; approved_at: string | null
  change_summary: { text?: string } | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',      cls: 'bg-slate-100 text-slate-600' },
  mapping:   { label: 'Mapping…',   cls: 'bg-amber-100 text-amber-700' },
  in_review: { label: 'In review',  cls: 'bg-indigo-100 text-indigo-700' },
  approved:  { label: 'Approved',   cls: 'bg-emerald-100 text-emerald-700' },
  archived:  { label: 'Archived',   cls: 'bg-slate-100 text-slate-400' },
}

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

export default function PricingMatrixPage() {
  const [rows, setRows] = useState<Calc[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pricing-matrix/calculators', { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const [deletingId, setDeletingId] = useState<string | null>(null)
  async function del(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This removes the calculator so you can re-upload/replace it. Quotes already generated keep their saved numbers.`)) return
    setDeletingId(id)
    try { await fetch(`/api/pricing-matrix/calculators/${id}`, { method: 'DELETE' }) } finally { setDeletingId(null); load() }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-[19px] font-semibold text-foreground">Pricing Matrix</h1>
          <p className="text-[12.5px] text-muted-foreground/80 mt-0.5">
            Upload each insurer&rsquo;s Excel calculator (+ brochure). We map its input/output cells once, then
            run the insurer&rsquo;s own formulas to quote a census — no rates are re-typed or re-derived.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pricing-matrix/quote/new" className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/5">
            <Calculator size={15} /> New quote
          </Link>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={15} /> Add calculator
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[12.5px] border-b border-border mt-4">
        <span className="pb-2 border-b-2 border-primary text-foreground font-medium">Calculators</span>
        <Link href="/pricing-matrix/quote" className="pb-2 border-b-2 border-transparent text-muted-foreground hover:text-foreground">Quotes</Link>
        <Link href="/pricing-matrix/compare" className="pb-2 border-b-2 border-transparent text-muted-foreground hover:text-foreground">Compare coverage</Link>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-16 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border border-dashed border-border rounded-xl">
            <FileSpreadsheet size={26} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm">No calculators yet. Add an insurer&rsquo;s Excel calculator to begin.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/60 border-b border-border">
                <th className="py-2 pr-3 font-medium">Insurer</th>
                <th className="py-2 pr-3 font-medium">Calculator file</th>
                <th className="py-2 pr-3 font-medium">Brochure</th>
                <th className="py-2 pr-3 font-medium">Effective</th>
                <th className="py-2 pr-3 font-medium">Ver.</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Added</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="group border-b border-border/50 hover:bg-muted/40">
                  <td className="py-2.5 pr-3">
                    <Link href={`/pricing-matrix/${r.id}`} className="font-medium text-foreground hover:text-primary">
                      {r.insurer_name || r.label || 'Untitled'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground/80"><span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={13} className="text-emerald-600/70" />{r.xlsx_filename || '—'}</span></td>
                  <td className="py-2.5 pr-3 text-muted-foreground/60">{r.brochure_filename ? <span className="inline-flex items-center gap-1.5"><FileText size={13} className="text-rose-500/60" />{r.brochure_filename}</span> : '—'}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground/70">{r.effective_date ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground/70">
                    v{r.version}
                    {r.change_summary?.text && (
                      <Link href={`/pricing-matrix/${r.id}`} title={r.change_summary.text} className="ml-1.5 inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100">changed</Link>
                    )}
                  </td>
                  <td className="py-2.5 pr-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS[r.status]?.cls ?? 'bg-slate-100 text-slate-500'}`}>{STATUS[r.status]?.label ?? r.status}</span></td>
                  <td className="py-2.5 pr-3 text-muted-foreground/50">{new Date(r.created_at).toLocaleDateString('en-SG')}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => del(r.id, r.insurer_name || r.label || 'this calculator')} disabled={deletingId === r.id}
                      title="Delete calculator" className="text-muted-foreground/30 hover:text-rose-500 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [insurer, setInsurer] = useState('')
  const [effDate, setEffDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    if (!xlsx.name.match(/\.(xlsx|xlsm|xls)$/i)) { setError('Calculator must be an Excel file (.xlsx, .xlsm or .xls)'); return }
    setBusy(true); setError(null)
    try {
      setStatus('Uploading calculator…')
      const xlsx_path = await uploadOne(xlsx, 'xlsx')
      let brochure_path: string | undefined
      if (pdf) { setStatus('Uploading brochure…'); brochure_path = await uploadOne(pdf, 'pdf') }
      setStatus('Creating…')
      const cr = await fetch('/api/pricing-matrix/calculators', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xlsx_path, xlsx_filename: xlsx.name, brochure_path, brochure_filename: pdf?.name, insurer_name: insurer || null, effective_date: effDate || null }),
      })
      const cd = await safeJson<{ id?: string }>(cr)
      if (!cr.ok || !cd.id) { setError(cd.error ?? 'Create failed'); return }
      onDone()
      router.push(`/pricing-matrix/${cd.id}?automap=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setBusy(false); setStatus(null) }
  }

  const drop = 'flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-xl py-6 px-3 min-w-0 cursor-pointer hover:border-primary/40 text-center'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card shadow-2xl p-5 flex flex-col gap-3.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Add insurer calculator</h3>
            <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">The Excel calculator is required; the brochure PDF is optional (used for wordings + recommendations).</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground"><X size={17} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className={drop}>
            <FileSpreadsheet size={20} className="text-emerald-600/70 shrink-0" />
            <span className="text-[12px] font-medium max-w-full truncate" title={xlsx?.name}>{xlsx ? xlsx.name : 'Calculator .xlsx *'}</span>
            <input type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e => setXlsx(e.target.files?.[0] ?? null)} />
          </label>
          <label className={drop}>
            <FileText size={20} className="text-rose-500/60 shrink-0" />
            <span className="text-[12px] font-medium max-w-full truncate" title={pdf?.name}>{pdf ? pdf.name : 'Brochure .pdf (optional)'}</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={e => setPdf(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="Insurer name (e.g. Steadfast MCare+)" className="text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25" />
          <input value={effDate} onChange={e => setEffDate(e.target.value)} type="date" title="Rate effective date" className="text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25" />
        </div>

        {error && <p className="text-[12px] text-rose-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-1">
          {status && <span className="text-[12px] text-muted-foreground mr-auto flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />{status}</span>}
          <button onClick={onClose} className="text-[13px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={busy || !xlsx} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Working…' : 'Upload & map'}
          </button>
        </div>
      </div>
    </div>
  )
}
