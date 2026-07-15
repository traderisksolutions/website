'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Save, FileText, RefreshCw, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Rate    = { id?: string; product_code: string; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }
type Plan    = { product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null; co_payment: string | null }
type Benefit = { product_code: string; plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null; value_numeric: number | null; unit: string | null; notes: string | null }
type Conflict = { product_code: string; plan_code: string; band_label: string; opus: number | null; gemini: number | null; parser_seen: boolean; note?: string; judge?: { premium: number | null; confidence: number; reason: string } | null }
type Detail  = { table: Record<string, unknown>; plans: Plan[]; rates: Rate[]; benefits: Benefit[]; conflicts: Conflict[]; confidence: number | null; extractors?: Record<string, { error: string | null; rates: number }> }

const cKey = (c: { product_code: string; plan_code: string; band_label: string }) => `${c.product_code}|${c.plan_code}|${c.band_label}`

export default function GbReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [rates, setRates] = useState<Rate[]>([])
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [status, setStatus] = useState<string>('')
  const [saving, setSaving] = useState<'save' | 'approve' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/rate-tables/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const data: Detail = await res.json()
    setD(data); setRates(data.rates); setBenefits(data.benefits)
    setStatus(String(data.table.status ?? ''))
  }, [id])

  useEffect(() => { load() }, [load])
  // Poll while extraction is running.
  useEffect(() => {
    if (status !== 'extracting') return
    const iv = setInterval(load, 3000)
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
      const saveRes = await fetch(`/api/group-benefits/rate-tables/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates, benefits }),
      })
      if (!saveRes.ok) { setMsg((await saveRes.json().catch(() => ({}))).error ?? 'Save failed'); return }
      if (approveAfter) {
        const ap = await fetch(`/api/group-benefits/rate-tables/${id}/approve`, { method: 'POST' })
        if (!ap.ok) { setMsg('Approve failed'); return }
        router.push('/group-benefits')
        return
      }
      setMsg('Saved'); load()
    } finally { setSaving(null) }
  }

  if (!d) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const t = d.table as { insurer_name?: string; product_code?: string; source_pdf_name?: string; age_basis?: string; plan_year?: number }
  const byProduct = groupBy(rates, r => r.product_code)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => router.push('/group-benefits')} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={13} /> Rate Tables</button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t.insurer_name || 'Unknown insurer'} · {t.product_code}</h1>
          <p className="text-[12px] text-muted-foreground/70 mt-0.5">{t.source_pdf_name} · age {t.age_basis === 'last_birthday' ? 'last' : 'next'} birthday{t.plan_year ? ` · ${t.plan_year}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={cn('text-[12px]', /fail/i.test(msg) ? 'text-rose-600' : 'text-emerald-600')}>{msg}</span>}
          {status === 'approved' && <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 mr-1">Approved</span>}
          <a href={`/api/group-benefits/rate-tables/${id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted">
            <FileText size={13} /> View PDF
          </a>
          {status !== 'extracting' && (
            <button onClick={reExtract} disabled={!!saving} className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50" title="Re-run the 3 extractors + judge">
              <RefreshCw size={13} /> Re-run
            </button>
          )}
          <button onClick={del} className="flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg border border-border text-rose-600 hover:bg-rose-50" title="Delete">
            <Trash2 size={13} />
          </button>
          {status === 'in_review' && (
            <>
              <button onClick={() => save(false)} disabled={!!saving} className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50">
                {saving === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
              <button onClick={() => save(true)} disabled={!!saving} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve version
              </button>
            </>
          )}
        </div>
      </div>

      {status === 'extracting' && (
        <div className="flex items-center gap-2 text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Loader2 size={15} className="animate-spin" /> Running 3 extractors + Opus judge on the PDF… this can take up to a minute.
        </div>
      )}

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

          {/* Rates by product/plan */}
          {Array.from(byProduct.entries()).map(([product, prRates]) => {
            const byPlan = groupBy(prRates, r => r.plan_code)
            return (
              <div key={product} className="mb-6">
                <h2 className="text-[13px] font-bold text-foreground mb-2">{product}</h2>
                <div className="flex flex-col gap-3">
                  {Array.from(byPlan.entries()).map(([plan, planRates]) => (
                    <div key={plan} className="border border-border rounded-lg overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/40 text-[11.5px] font-semibold text-foreground/80">{plan}</div>
                      <div className="divide-y divide-border/60">
                        {planRates.sort((a, b) => (a.age_min ?? 0) - (b.age_min ?? 0)).map((r) => {
                          const conflict = conflictMap.get(cKey(r))
                          const idx = rates.indexOf(r)
                          const editable = status === 'in_review'
                          return (
                            <div key={idx} className={cn('flex items-center gap-2 px-3 py-1.5 text-[12px]', conflict && 'bg-amber-50/60')}>
                              <input value={r.band_label} disabled={!editable} onChange={e => updateRate(idx, { band_label: e.target.value })}
                                className="w-28 text-[12px] px-2 py-0.5 rounded border border-transparent hover:border-border focus:border-primary/40 focus:outline-none bg-transparent text-muted-foreground/80 disabled:hover:border-transparent" />
                              <span className="text-muted-foreground/40">$</span>
                              <input type="number" step="0.01" value={r.premium} disabled={!editable}
                                onChange={e => updateRate(idx, { premium: parseFloat(e.target.value) || 0 })}
                                className={cn('w-28 text-[12px] px-2 py-0.5 rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30', conflict ? 'border-amber-300' : 'border-border')} />
                              {conflict && (
                                <span className="text-[10.5px] text-amber-700 flex items-center gap-2">
                                  <span>Opus {fmt(conflict.opus)} · Gemini {fmt(conflict.gemini)}{!conflict.parser_seen ? ' · not in text' : ''}</span>
                                  {conflict.judge?.premium != null && <span className="font-semibold text-amber-800">→ judge {fmt(conflict.judge.premium)} ({conflict.judge.confidence}%)</span>}
                                </span>
                              )}
                              {editable && <button onClick={() => setRates(prev => prev.filter((_, i) => i !== idx))} className="ml-auto text-muted-foreground/30 hover:text-rose-600"><Trash2 size={12} /></button>}
                            </div>
                          )
                        })}
                      </div>
                      {status === 'in_review' && (
                        <button onClick={() => setRates(prev => [...prev, { product_code: product, plan_code: plan, band_label: '', age_min: null, age_max: null, premium: 0 }])}
                          className="w-full flex items-center justify-center gap-1 px-3 py-1 text-[11px] text-primary hover:bg-primary/5 border-t border-border/60"><Plus size={11} /> Add band</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Benefits */}
          {benefits.length > 0 && (
            <div className="mb-6">
              <h2 className="text-[13px] font-bold text-foreground mb-2">Benefit schedule ({benefits.length})</h2>
              <div className="border border-border rounded-lg divide-y divide-border/60 max-h-[420px] overflow-y-auto">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-[11.5px]">
                    <span className="w-14 text-muted-foreground/50 flex-shrink-0">{b.product_code}{b.plan_code ? `·${b.plan_code}` : ''}</span>
                    <span className="flex-1 text-foreground/80 truncate">{b.category ? `${b.category} — ` : ''}{b.benefit_name}</span>
                    <input value={b.value_text ?? ''} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, value_text: e.target.value } : x))}
                      className="w-40 text-[11.5px] px-2 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of arr) { const k = key(x); (m.get(k) ?? m.set(k, []).get(k)!).push(x) }
  return m
}
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${n}`)
