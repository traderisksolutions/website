'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Save, FileText, RefreshCw, Trash2, Pencil, X } from 'lucide-react'
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

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/rate-tables/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const data: Detail = await res.json()
    setD(data); setRates(data.rates); setBenefits(data.benefits); setCoverage(data.coverage ?? [])
    setStatus(String(data.table.status ?? ''))
    const t = data.table as Record<string, unknown>
    setMeta({
      insurer_id:     (t.insurer_id as string) ?? '',
      insurer_name:   (t.insurer_name as string) ?? '',
      product_code:   (t.product_code as string) ?? '',
      age_basis:      (t.age_basis as string) ?? 'next_birthday',
      plan_year:      t.plan_year != null ? String(t.plan_year) : '',
      effective_date: (t.effective_date as string) ?? '',
    })
  }, [id])

  useEffect(() => { fetch('/api/settings/insurers', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(rows => setInsurers(Array.isArray(rows) ? rows : [])).catch(() => {}) }, [])

  useEffect(() => { load() }, [load])
  // Poll while extraction is running.
  useEffect(() => {
    if (status !== 'extracting') return
    const iv = setInterval(load, 1800)
    return () => clearInterval(iv)
  }, [status, load])

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
        body: JSON.stringify({ rates, benefits, meta: metaPayload }),
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
  function cancelEdit() { setEditing(false); setMsg(null); load() }

  if (!d) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const t = d.table as { insurer_name?: string; product_code?: string; source_pdf_name?: string; age_basis?: string; plan_year?: number }
  const byProduct = groupBy(rates, r => r.product_code)
  const mi = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/25'
  const btn = 'flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50'
  const insurerLabel = meta.insurer_name || t.insurer_name || 'Insurer'
  const editable = status === 'in_review' || editing   // cells + metadata are editable in review, or when explicitly editing an approved table

  return (
    <div className="min-h-screen bg-white">
    <div className="max-w-6xl mx-auto px-8 py-6">
      <button onClick={() => router.push('/group-benefits')} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={13} /> Rate Tables</button>

      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold text-foreground tracking-tight truncate">{insurerLabel}</h1>
          <p className="text-[12px] text-muted-foreground mt-1 truncate">
            {t.source_pdf_name} · age {t.age_basis === 'last_birthday' ? 'last' : 'next'} birthday{t.plan_year ? ` · ${t.plan_year}` : ''} · {byProduct.size} product{byProduct.size === 1 ? '' : 's'} · {rates.length} rates
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {msg && <span className={cn('text-[12px] mr-2', /fail/i.test(msg) ? 'text-rose-600' : 'text-emerald-600')}>{msg}</span>}
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
                            {plans.map(p => <th key={p} className="text-right pr-4">{p}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {bands.map(band => (
                            <tr key={band}>
                              <td className="pl-4 font-medium text-foreground/70 whitespace-nowrap">{band}</td>
                              {plans.map(plan => {
                                const r = cell.get(`${band}|${plan}`)
                                if (!r) return <td key={plan} className="text-right pr-4 text-muted-foreground/25">—</td>
                                const idx = rates.indexOf(r)
                                const conflict = conflictMap.get(cKey(r))
                                return (
                                  <td key={plan} className="text-right pr-2 py-1">
                                    <input type="number" step="0.01" value={r.premium} disabled={!editable}
                                      onChange={e => updateRate(idx, { premium: parseFloat(e.target.value) || 0 })}
                                      title={conflict ? `Opus ${fmt(conflict.opus)} · Gemini ${fmt(conflict.gemini)}` : ''}
                                      className={cn('w-24 text-right tabular-nums text-[12.5px] px-2 py-1 rounded border bg-white focus:outline-none focus:ring-1 focus:ring-primary/30',
                                        conflict ? 'border-amber-300 bg-amber-50/70' : 'border-transparent hover:border-border')} />
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </section>
          ))}

          {/* Coverage / sum assured */}
          {coverage.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[14px] font-semibold text-foreground mb-3 pb-1.5 border-b border-border">Coverage &amp; sum assured</h2>
              <div className="rounded-lg border border-border overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="data-table w-full border-collapse text-[12.5px]">
                  <thead><tr>
                    <th className="pl-4 text-left">Product</th><th className="text-left">Member</th><th className="text-left">Plan</th><th className="text-left">Item</th><th className="text-right pr-4">Value</th>
                  </tr></thead>
                  <tbody>
                    {coverage.map((c, i) => (
                      <tr key={i}>
                        <td className="pl-4 whitespace-nowrap text-foreground/80">{c.product_title}</td>
                        <td className="text-muted-foreground">{c.member_type ? mtLabel(c.member_type) : '—'}</td>
                        <td className="text-muted-foreground">{c.plan_code ?? '—'}</td>
                        <td className="text-foreground/80">{c.item_label}</td>
                        <td className="text-right pr-4 tabular-nums font-medium">{c.value_numeric != null ? c.value_numeric.toLocaleString('en-SG') : c.value_text}{c.unit ? ` ${c.unit}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Benefits */}
          {benefits.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[14px] font-semibold text-foreground mb-3 pb-1.5 border-b border-border">Benefit schedule</h2>
              <div className="rounded-lg border border-border overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="data-table w-full border-collapse text-[12px]">
                  <thead><tr>
                    <th className="pl-4 text-left">Scope</th><th className="text-left">Benefit</th><th className="text-right pr-4">Value</th>
                  </tr></thead>
                  <tbody>
                    {benefits.map((b, i) => (
                      <tr key={i}>
                        <td className="pl-4 whitespace-nowrap text-muted-foreground">{b.product_code}{b.plan_code ? ` · ${b.plan_code}` : ''}</td>
                        <td className="text-foreground/80">{b.category ? `${b.category} — ` : ''}{b.benefit_name}</td>
                        <td className="text-right pr-2 py-1">
                          <input value={b.value_text ?? ''} disabled={!editable} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, value_text: e.target.value } : x))}
                            className="w-44 text-right text-[12px] px-2 py-1 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-white disabled:hover:border-transparent" />
                        </td>
                      </tr>
                    ))}
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
