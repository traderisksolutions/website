'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Save, FileText, RefreshCw, Trash2, Pencil, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Rate    = { id?: string; product_code: string; member_type: string | null; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }
type Plan    = { product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null; co_payment: string | null }
type Benefit = { product_code: string; plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null; value_numeric: number | null; unit: string | null; notes: string | null }
type Coverage = { product_title: string | null; member_type: string | null; plan_code: string | null; item_label: string; value_numeric: number | null; value_text: string | null; unit: string | null }
type Conflict = { product_title: string; member_type: string | null; plan_code: string; band_label: string; opus: number | null; gemini: number | null; parser_seen: boolean; note?: string; judge?: { price: number | null; confidence: number; reason: string } | null }
type Detail  = { table: Record<string, unknown>; plans: Plan[]; rates: Rate[]; benefits: Benefit[]; coverage: Coverage[]; conflicts: Conflict[]; confidence: number | null; extractors?: Record<string, { error: string | null; rates: number }> }

// Keyed by product title + member type + plan + band (matches the judge's conflict keys).
const cKey = (c: { product_title?: string; product_code?: string; member_type: string | null; plan_code: string; band_label: string }) =>
  `${c.product_title ?? c.product_code ?? ''}|${c.member_type ?? ''}|${c.plan_code}|${c.band_label}`
const mtLabel = (m: string | null) => m === 'employee' ? 'Employee' : m === 'dependant' ? 'Dependant' : ''

// Live extraction stages for the progress checklist (server reports the current one).
const STAGES = [
  { key: 'reading',    label: 'Reading the PDF' },
  { key: 'extracting', label: 'Extracting — Opus + Gemini + text parser' },
  { key: 'judging',    label: 'Opus judge reconciling the numbers' },
  { key: 'saving',     label: 'Saving results' },
]

export default function GbReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [rates, setRates] = useState<Rate[]>([])
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [coverage, setCoverage] = useState<Coverage[]>([])
  const [status, setStatus] = useState<string>('')
  const [saving, setSaving] = useState<'save' | 'approve' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [insurers, setInsurers] = useState<{ id: string; name: string }[]>([])
  const [editing, setEditing] = useState(false)   // edit an already-approved table without re-extracting
  const [snapshot, setSnapshot] = useState('')     // serialized state at load, to detect unsaved edits

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/rate-tables/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const data: Detail = await res.json()
    setD(data); setRates(data.rates); setBenefits(data.benefits); setCoverage(data.coverage ?? [])
    setStatus(String(data.table.status ?? ''))
    const t = data.table as Record<string, unknown>
    const m = {
      insurer_id:     (t.insurer_id as string) ?? '',
      insurer_name:   (t.insurer_name as string) ?? '',
      product_code:   (t.product_code as string) ?? '',
      age_basis:      (t.age_basis as string) ?? 'next_birthday',
      plan_year:      t.plan_year != null ? String(t.plan_year) : '',
      effective_date: (t.effective_date as string) ?? '',
    }
    setMeta(m)
    setSnapshot(JSON.stringify({ r: data.rates, b: data.benefits, c: data.coverage ?? [], m }))
  }, [id])

  useEffect(() => { fetch('/api/settings/insurers', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => setInsurers(Array.isArray(rows) ? rows : [])).catch(() => {}) }, [])

  useEffect(() => { load() }, [load])
  // Poll while extraction is running.
  useEffect(() => {
    if (status !== 'extracting') return
    const iv = setInterval(load, 1800)
    return () => clearInterval(iv)
  }, [status, load])

  // Unsaved-changes tracking: compare current editable state to the snapshot taken at load.
  const dirty = useMemo(() => snapshot !== '' && JSON.stringify({ r: rates, b: benefits, c: coverage, m: meta }) !== snapshot, [rates, benefits, coverage, meta, snapshot])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function leave() { if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return; router.push('/group-benefits') }

  // Single source of truth for kicking extraction: if the table is still a fresh draft
  // (upload succeeded but extraction never started), start it here. Ref guards double-fire.
  const triggered = React.useRef(false)
  useEffect(() => {
    if (status === 'draft' && !triggered.current) {
      triggered.current = true
      fetch(`/api/group-benefits/rate-tables/${id}/extract`, { method: 'POST' }).catch(() => {})
      setStatus('extracting')
    }
  }, [status, id])

  async function reExtract() {
    triggered.current = true
    setStatus('extracting')
    await fetch(`/api/group-benefits/rate-tables/${id}/extract`, { method: 'POST' }).catch(() => {})
    load()
  }
  async function del() {
    if (!confirm('Delete this rate table and its extraction? This cannot be undone.')) return
    await fetch(`/api/group-benefits/rate-tables/${id}`, { method: 'DELETE' })
    router.push('/group-benefits')
  }

  const conflictMap = new Map((d?.conflicts ?? []).map(c => [cKey(c), c]))

  function updateRate(idx: number, patch: Partial<Rate>) { setRates(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x))) }

  // ── Structural edits on the flat rates (matrix add/remove/rename) ──────────────
  const gm = (m: string | null) => m ?? ''                       // member-type group key
  const inGroup = (r: Rate, product: string, mt: string) => r.product_code === product && gm(r.member_type) === mt
  function renameBand(product: string, mt: string, oldB: string, newB: string) { if (!newB || newB === oldB) return; setRates(prev => prev.map(r => (inGroup(r, product, mt) && r.band_label === oldB ? { ...r, band_label: newB } : r))) }
  function renamePlan(product: string, mt: string, oldP: string, newP: string) { if (!newP || newP === oldP) return; setRates(prev => prev.map(r => (inGroup(r, product, mt) && r.plan_code === oldP ? { ...r, plan_code: newP } : r))) }
  function deleteBand(product: string, mt: string, band: string) { setRates(prev => prev.filter(r => !(inGroup(r, product, mt) && r.band_label === band))) }
  function deletePlan(product: string, mt: string, plan: string) { setRates(prev => prev.filter(r => !(inGroup(r, product, mt) && r.plan_code === plan))) }
  function addBand(product: string, mt: string, plans: string[], bands: string[]) { let n = 1, label = 'New band'; while (bands.includes(label)) label = `New band ${++n}`; setRates(prev => [...prev, ...plans.map(p => ({ product_code: product, member_type: mt || null, plan_code: p, band_label: label, age_min: null, age_max: null, premium: 0 }))]) }
  function addPlan(product: string, mt: string, bands: string[], plans: string[]) { let n = 1, code = 'New plan'; while (plans.includes(code)) code = `New plan ${++n}`; setRates(prev => [...prev, ...(bands.length ? bands : ['Up to 99']).map(b => ({ product_code: product, member_type: mt || null, plan_code: code, band_label: b, age_min: null, age_max: null, premium: 0 }))]) }
  function addProduct() { setRates(prev => [...prev, { product_code: 'New product', member_type: null, plan_code: 'Plan 1', band_label: 'Up to 99', age_min: 0, age_max: 99, premium: 0 }]) }
  function setCell(product: string, mt: string, band: string, plan: string, valStr: string) {
    const num = parseFloat(valStr)
    setRates(prev => {
      const i = prev.findIndex(r => inGroup(r, product, mt) && r.band_label === band && r.plan_code === plan)
      if (i >= 0) return prev.map((r, j) => (j === i ? { ...r, premium: isFinite(num) ? num : 0 } : r))
      if (!isFinite(num)) return prev
      return [...prev, { product_code: product, member_type: mt || null, plan_code: plan, band_label: band, age_min: null, age_max: null, premium: num }]
    })
  }
  // Coverage + benefit row edits
  function updateCoverage(i: number, patch: Partial<Coverage>) { setCoverage(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x))) }
  function addCoverage() { setCoverage(prev => [...prev, { product_title: rates[0]?.product_code ?? '', member_type: null, plan_code: null, item_label: 'New item', value_numeric: null, value_text: '', unit: null }]) }
  function addBenefit() { setBenefits(prev => [...prev, { product_code: '', plan_code: null, category: null, benefit_name: 'New benefit', value_text: '', value_numeric: null, unit: null, notes: null }]) }

  async function save(approveAfter = false) {
    if (approveAfter && (d?.conflicts?.length ?? 0) > 0 &&
        !confirm(`${d!.conflicts.length} cell(s) are still flagged for review. Approve anyway?`)) return
    setSaving(approveAfter ? 'approve' : 'save'); setMsg(null)
    try {
      const metaPayload = {
        insurer_id:     meta.insurer_id || null,
        insurer_name:   meta.insurer_name || null,
        product_code:   meta.product_code || '',
        age_basis:      meta.age_basis || 'next_birthday',
        plan_year:      meta.plan_year ? Number(meta.plan_year) : null,
        effective_date: meta.effective_date || null,
      }
      const saveRes = await fetch(`/api/group-benefits/rate-tables/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates, benefits, coverage, meta: metaPayload }),
      })
      if (!saveRes.ok) { setMsg((await saveRes.json().catch(() => ({}))).error ?? 'Save failed'); return }
      if (approveAfter) {
        const ap = await fetch(`/api/group-benefits/rate-tables/${id}/approve`, { method: 'POST' })
        if (!ap.ok) { setMsg('Approve failed'); return }
        router.push('/group-benefits')
        return
      }
      setMsg('Saved'); setEditing(false); load()
    } finally { setSaving(null) }
  }
  function cancelEdit() { if (dirty && !confirm('Discard unsaved changes?')) return; setEditing(false); setMsg(null); load() }

  if (!d) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const t = d.table as { insurer_name?: string; product_code?: string; source_pdf_name?: string; age_basis?: string; plan_year?: number }
  const byProduct = groupBy(rates, r => r.product_code)
  const mi = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/25'
  const ci = 'w-full text-[12px] px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-white'
  const btn = 'flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50'
  const insurerLabel = meta.insurer_name || t.insurer_name || 'Insurer'
  const editable = status === 'in_review' || editing   // cells + metadata are editable in review, or when explicitly editing an approved table

  return (
    <div className="min-h-screen bg-white">
    <div className="max-w-6xl mx-auto px-8 py-6">
      <button onClick={leave} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={13} /> Rate Tables</button>

      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold text-foreground tracking-tight truncate">{insurerLabel}</h1>
          <p className="text-[12px] text-muted-foreground mt-1 truncate">
            {t.source_pdf_name} · age {t.age_basis === 'last_birthday' ? 'last' : 'next'} birthday{t.plan_year ? ` · ${t.plan_year}` : ''} · {byProduct.size} product{byProduct.size === 1 ? '' : 's'} · {rates.length} rates
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {dirty && <span className="text-[11px] font-medium text-amber-600 mr-2">Unsaved changes</span>}
          {msg && !dirty && <span className={cn('text-[12px] mr-2', /fail/i.test(msg) ? 'text-rose-600' : 'text-emerald-600')}>{msg}</span>}
          {status === 'approved' && !editing && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 mr-1.5">Approved</span>}
          <a href={`/api/group-benefits/rate-tables/${id}/pdf`} target="_blank" rel="noopener noreferrer" className={btn}><FileText size={13} /> PDF</a>
          {status !== 'extracting' && !editing && <button onClick={reExtract} disabled={!!saving} className={btn} title="Re-run extraction"><RefreshCw size={13} /> Re-run</button>}
          {!editing && <button onClick={del} className={cn(btn, 'text-rose-500 hover:text-rose-600 hover:bg-rose-50')} title="Delete"><Trash2 size={13} /></button>}

          {/* Edit an approved table in place (no re-extract) */}
          {status === 'approved' && !editing && (
            <>
              <span className="w-px h-5 bg-border mx-1.5" />
              <button onClick={() => setEditing(true)} className={btn}><Pencil size={13} /> Edit</button>
            </>
          )}
          {(status === 'in_review' || editing) && (
            <>
              <span className="w-px h-5 bg-border mx-1.5" />
              {editing && <button onClick={cancelEdit} disabled={!!saving} className={btn}><X size={13} /> Cancel</button>}
              <button onClick={() => save(false)} disabled={!!saving} className={btn}>
                {saving === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {editing ? 'Save changes' : 'Save'}
              </button>
              {status === 'in_review' && (
                <button onClick={() => save(true)} disabled={!!saving} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
                  {saving === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Extracted metadata — read from the PDF, editable in review or edit mode */}
      {editable && (
        <div className="rounded-lg border border-border bg-white p-4 mb-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">Details read from the PDF — correct if needed</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Insurer</label>
              <input value={meta.insurer_name ?? ''} onChange={e => setMeta(m => ({ ...m, insurer_name: e.target.value }))} placeholder="Insurer name" className={`${mi} mt-1`} />
              <select value={meta.insurer_id ?? ''} onChange={e => { const iid = e.target.value; setMeta(m => ({ ...m, insurer_id: iid, insurer_name: insurers.find(i => i.id === iid)?.name ?? m.insurer_name })) }} className={`${mi} mt-1.5 text-muted-foreground`}>
                <option value="">Link to directory (optional)…</option>
                {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Age basis</label>
              <select value={meta.age_basis ?? 'next_birthday'} onChange={e => setMeta(m => ({ ...m, age_basis: e.target.value }))} className={`${mi} mt-1`}>
                <option value="next_birthday">Next birthday</option>
                <option value="last_birthday">Last birthday</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Plan year</label>
              <input value={meta.plan_year ?? ''} onChange={e => setMeta(m => ({ ...m, plan_year: e.target.value }))} placeholder="2026" className={`${mi} mt-1`} />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Effective date</label>
              <input type="date" value={meta.effective_date ?? ''} onChange={e => setMeta(m => ({ ...m, effective_date: e.target.value }))} className={`${mi} mt-1`} />
            </div>
          </div>
        </div>
      )}

      {status === 'extracting' && (() => {
        const stage = (d.table as { extract_stage?: string | null }).extract_stage ?? 'reading'
        const cur = Math.max(0, STAGES.findIndex(s => s.key === stage))
        return (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3.5">
            <p className="text-[12px] font-semibold text-amber-800 mb-2.5">Extracting the rate matrix — this can take up to a minute…</p>
            <div className="flex flex-col gap-1.5">
              {STAGES.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 text-[12px]">
                  {i < cur ? <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                    : i === cur ? <Loader2 size={14} className="animate-spin text-amber-600 flex-shrink-0" />
                    : <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />}
                  <span className={cn(i <= cur ? 'text-foreground/80 font-medium' : 'text-muted-foreground/50')}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {status !== 'extracting' && (
        <>
          {/* Per-extractor status — surfaces a failed model/key so partial data isn't silent */}
          {d.extractors && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
              {(['opus', 'gemini', 'parser'] as const).map(k => {
                const e = d.extractors![k]
                if (!e) return null
                return (
                  <span key={k} className={cn('px-2 py-0.5 rounded-full font-medium',
                    e.error ? 'bg-rose-100 text-rose-700' : 'bg-muted text-muted-foreground')}
                    title={e.error ?? ''}>
                    {k}: {e.error ? 'failed' : `${e.rates} cells`}
                  </span>
                )
              })}
            </div>
          )}

          {/* Conflict summary */}
          <div className={cn('flex items-center gap-2 rounded-lg px-4 py-2.5 mb-5 text-[12.5px]',
            d.conflicts.length ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800')}>
            {d.conflicts.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {d.confidence != null && <span className="font-semibold">{d.confidence}% agreement</span>}
            <span>· {d.conflicts.length} cell{d.conflicts.length === 1 ? '' : 's'} to verify (highlighted below){rates.length ? ` · ${rates.length} rates` : ''}</span>
          </div>

          {rates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-[13px]">
              No rates were extracted. Check the extractor statuses above (API keys / model access), then <button onClick={reExtract} className="text-primary underline">re-run</button>.
            </div>
          )}

          {/* Rates: a matrix (age band × plan) per product → member type */}
          {Array.from(byProduct.entries()).map(([product, prRates]) => (
            <section key={product} className="mb-8">
              <h2 className="text-[14px] font-semibold text-foreground mb-3 pb-1.5 border-b border-border">{product}</h2>
              {Array.from(groupBy(prRates, r => r.member_type ?? '').entries()).map(([mt, mtRates]) => {
                const plans = Array.from(new Set(mtRates.map(r => r.plan_code)))
                const order = new Map<string, number>()
                for (const r of mtRates) if (!order.has(r.band_label)) order.set(r.band_label, r.age_min ?? 9999)
                const bands = Array.from(order.keys()).sort((a, b) => (order.get(a)! - order.get(b)!) || a.localeCompare(b))
                const cell = new Map<string, Rate>()
                for (const r of mtRates) cell.set(`${r.band_label}|${r.plan_code}`, r)
                return (
                  <div key={mt} className="mb-5">
                    {mtLabel(mt || null) && <p className="text-[10px] font-bold uppercase tracking-wider text-primary/60 mb-2">{mtLabel(mt || null)}</p>}
                    <div className="rounded-lg border border-border overflow-x-auto">
                      <table className="data-table w-full border-collapse text-[12.5px]">
                        <thead>
                          <tr>
                            <th className="text-left pl-4">Age band</th>
                            {plans.map(plan => (
                              <th key={plan} className="text-right pr-2">
                                {editable ? (
                                  <span className="inline-flex items-center gap-1 justify-end">
                                    <input defaultValue={plan} key={plan} onBlur={e => renamePlan(product, mt, plan, e.target.value.trim())}
                                      className="w-24 text-right text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-white" />
                                    <button onClick={() => deletePlan(product, mt, plan)} title="Remove plan" className="text-muted-foreground/30 hover:text-rose-600"><X size={11} /></button>
                                  </span>
                                ) : plan}
                              </th>
                            ))}
                            {editable && <th className="pr-2 text-right"><button onClick={() => addPlan(product, mt, bands, plans)} title="Add plan" className="text-primary/70 hover:text-primary"><Plus size={13} /></button></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {bands.map(band => (
                            <tr key={band}>
                              <td className="pl-4 whitespace-nowrap">
                                {editable
                                  ? <input defaultValue={band} key={band} onBlur={e => renameBand(product, mt, band, e.target.value.trim())}
                                      className="w-28 text-[12.5px] font-medium px-2 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-white" />
                                  : <span className="font-medium text-foreground/70">{band}</span>}
                              </td>
                              {plans.map(plan => {
                                const r = cell.get(`${band}|${plan}`)
                                const conflict = r ? conflictMap.get(cKey(r)) : undefined
                                if (!editable) return r
                                  ? <td key={plan} className="text-right pr-2 py-1"><input type="number" value={r.premium} disabled title={conflict ? `Opus ${fmt(conflict.opus)} · Gemini ${fmt(conflict.gemini)}` : ''} className={cn('w-24 text-right tabular-nums text-[12.5px] px-2 py-1 rounded border bg-white', conflict ? 'border-amber-300 bg-amber-50/70' : 'border-transparent')} /></td>
                                  : <td key={plan} className="text-right pr-4 text-muted-foreground/25">—</td>
                                return (
                                  <td key={plan} className="text-right pr-2 py-1">
                                    <input type="number" step="0.01" value={r ? r.premium : ''} placeholder="—"
                                      onChange={e => setCell(product, mt, band, plan, e.target.value)}
                                      title={conflict ? `Opus ${fmt(conflict.opus)} · Gemini ${fmt(conflict.gemini)}` : ''}
                                      className={cn('w-24 text-right tabular-nums text-[12.5px] px-2 py-1 rounded border bg-white focus:outline-none focus:ring-1 focus:ring-primary/30',
                                        conflict ? 'border-amber-300 bg-amber-50/70' : 'border-transparent hover:border-border')} />
                                  </td>
                                )
                              })}
                              {editable && <td className="pr-2 text-right"><button onClick={() => deleteBand(product, mt, band)} title="Remove age band" className="text-muted-foreground/30 hover:text-rose-600"><Trash2 size={12} /></button></td>}
                            </tr>
                          ))}
                          {editable && (
                            <tr><td colSpan={plans.length + 2} className="pl-4">
                              <button onClick={() => addBand(product, mt, plans, bands)} className="flex items-center gap-1 text-[11.5px] text-primary hover:text-primary/80 py-1"><Plus size={12} /> Add age band</button>
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </section>
          ))}

          {editable && (
            <button onClick={addProduct} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 mb-8"><Plus size={13} /> Add product / matrix</button>
          )}

          {/* Coverage / sum assured */}
          {(coverage.length > 0 || editable) && (
            <section className="mb-8">
              <h2 className="text-[14px] font-semibold text-foreground mb-3 pb-1.5 border-b border-border">Coverage &amp; sum assured</h2>
              <div className="rounded-lg border border-border overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="data-table w-full border-collapse text-[12.5px]">
                  <thead><tr>
                    <th className="pl-4 text-left">Product</th><th className="text-left">Member</th><th className="text-left">Plan</th><th className="text-left">Item</th><th className="text-right pr-4">Value</th>{editable && <th />}
                  </tr></thead>
                  <tbody>
                    {coverage.map((c, i) => editable ? (
                      <tr key={i}>
                        <td className="pl-4"><input value={c.product_title ?? ''} onChange={e => updateCoverage(i, { product_title: e.target.value })} className={ci} /></td>
                        <td><select value={c.member_type ?? ''} onChange={e => updateCoverage(i, { member_type: e.target.value || null })} className={ci}><option value="">—</option><option value="employee">Employee</option><option value="dependant">Dependant</option></select></td>
                        <td><input value={c.plan_code ?? ''} onChange={e => updateCoverage(i, { plan_code: e.target.value || null })} className={ci} /></td>
                        <td><input value={c.item_label} onChange={e => updateCoverage(i, { item_label: e.target.value })} className={ci} /></td>
                        <td className="text-right pr-2"><input value={c.value_numeric != null ? String(c.value_numeric) : (c.value_text ?? '')} onChange={e => { const n = parseFloat(e.target.value.replace(/,/g, '')); updateCoverage(i, isFinite(n) && /^[\d.,]+$/.test(e.target.value) ? { value_numeric: n, value_text: null } : { value_numeric: null, value_text: e.target.value }) }} className={cn(ci, 'text-right w-32')} /></td>
                        <td className="pr-2 text-right"><button onClick={() => setCoverage(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-rose-600"><Trash2 size={12} /></button></td>
                      </tr>
                    ) : (
                      <tr key={i}>
                        <td className="pl-4 whitespace-nowrap text-foreground/80">{c.product_title}</td>
                        <td className="text-muted-foreground">{c.member_type ? mtLabel(c.member_type) : '—'}</td>
                        <td className="text-muted-foreground">{c.plan_code ?? '—'}</td>
                        <td className="text-foreground/80">{c.item_label}</td>
                        <td className="text-right pr-4 tabular-nums font-medium">{c.value_numeric != null ? c.value_numeric.toLocaleString('en-SG') : c.value_text}{c.unit ? ` ${c.unit}` : ''}</td>
                      </tr>
                    ))}
                    {editable && <tr><td colSpan={6} className="pl-4"><button onClick={addCoverage} className="flex items-center gap-1 text-[11.5px] text-primary py-1"><Plus size={12} /> Add coverage row</button></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Benefits */}
          {(benefits.length > 0 || editable) && (
            <section className="mb-8">
              <h2 className="text-[14px] font-semibold text-foreground mb-3 pb-1.5 border-b border-border">Benefit schedule</h2>
              <div className="rounded-lg border border-border overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="data-table w-full border-collapse text-[12px]">
                  <thead><tr>
                    <th className="pl-4 text-left">Scope</th><th className="text-left">Benefit</th><th className="text-right pr-4">Value</th>{editable && <th />}
                  </tr></thead>
                  <tbody>
                    {benefits.map((b, i) => (
                      <tr key={i}>
                        <td className="pl-4 whitespace-nowrap text-muted-foreground">
                          {editable
                            ? <input value={b.product_code ?? ''} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, product_code: e.target.value } : x))} placeholder="product" className={cn(ci, 'w-24')} />
                            : <>{b.product_code}{b.plan_code ? ` · ${b.plan_code}` : ''}</>}
                        </td>
                        <td className="text-foreground/80">
                          {editable
                            ? <input value={b.benefit_name} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, benefit_name: e.target.value } : x))} className={ci} />
                            : <>{b.category ? `${b.category} — ` : ''}{b.benefit_name}</>}
                        </td>
                        <td className="text-right pr-2 py-1">
                          <input value={b.value_text ?? ''} disabled={!editable} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, value_text: e.target.value } : x))}
                            className={cn('w-44 text-right text-[12px] px-2 py-1 rounded border bg-white focus:outline-none', editable ? 'border-transparent hover:border-border focus:border-primary/40' : 'border-transparent')} />
                        </td>
                        {editable && <td className="pr-2 text-right"><button onClick={() => setBenefits(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-rose-600"><Trash2 size={12} /></button></td>}
                      </tr>
                    ))}
                    {editable && <tr><td colSpan={4} className="pl-4"><button onClick={addBenefit} className="flex items-center gap-1 text-[11.5px] text-primary py-1"><Plus size={12} /> Add benefit row</button></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
    </div>
  )
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of arr) { const k = key(x); (m.get(k) ?? m.set(k, []).get(k)!).push(x) }
  return m
}
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${n}`)
