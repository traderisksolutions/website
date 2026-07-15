'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type InsurerResult = { rate_table_id: string; insurer_id: string | null; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Line = { member_name: string; relationship: string; category: string; age: number | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null }
type Analysis = { comparison: { benefit: string; by_insurer: Record<string, string> }[]; insurers: { insurer: string; pros: string[]; cons: string[] }[]; recommendation: string }
type Quotation = { id: string; company_name: string | null; effective_date: string | null; product_codes: string[]; member_count: number; results: InsurerResult[]; benefits_analysis: Analysis | null; created_at: string; source: string }

const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState<Quotation | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/quote/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const d = await res.json()
    setQ(d.quotation); setLines(d.lines ?? []); setAnalysis(d.quotation?.benefits_analysis ?? null)
  }, [id])
  useEffect(() => { load() }, [load])

  const byInsurer = useMemo(() => {
    if (!q) return []
    const m = new Map<string, { insurer_name: string; subtotal: number; gst: number; total: number; missing: number; by_product: Record<string, number> }>()
    for (const r of q.results ?? []) {
      const key = r.insurer_id ?? `name:${r.insurer_name}`
      const e = m.get(key) ?? { insurer_name: r.insurer_name, subtotal: 0, gst: 0, total: 0, missing: 0, by_product: {} }
      e.subtotal += r.subtotal; e.gst += r.gst; e.total += r.total; e.missing += r.missing
      for (const [p, v] of Object.entries(r.by_product)) e.by_product[p] = (e.by_product[p] ?? 0) + v
      m.set(key, e)
    }
    return Array.from(m.values()).sort((a, b) => a.total - b.total)
  }, [q])

  const insurerNames = useMemo(() => analysis ? Array.from(new Set((analysis.comparison ?? []).flatMap(r => Object.keys(r.by_insurer ?? {})))) : [], [analysis])

  async function compareBenefits() {
    setAnalyzing(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/compare-benefits`, { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.analysis) setAnalysis(d.analysis); else setError(d.error ?? 'Comparison failed')
    } finally { setAnalyzing(false) }
  }

  if (!q) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => router.push('/group-benefits')} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={13} /> Pricing Matrix</button>

      <div className="mb-5">
        <h1 className="text-lg font-bold text-foreground">{q.company_name || 'Untitled quote'}</h1>
        <p className="text-[12px] text-muted-foreground/70 mt-0.5">{q.member_count} members · {(q.product_codes ?? []).join('/')}{q.effective_date ? ` · eff ${q.effective_date}` : ''} · {new Date(q.created_at).toLocaleString('en-SG')}</p>
      </div>

      {/* Comparison cards */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${Math.min(byInsurer.length, 4)}, minmax(0,1fr))` }}>
        {byInsurer.map((r, i) => (
          <div key={r.insurer_name} className={cn('rounded-xl border p-4', i === 0 ? 'border-emerald-300 bg-emerald-50/40' : 'border-border bg-card')}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">{r.insurer_name}</span>
              {i === 0 && <span className="text-[9px] font-bold uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">Lowest</span>}
            </div>
            <p className="text-[22px] font-bold text-foreground mt-1">{money(r.total)}</p>
            <p className="text-[10.5px] text-muted-foreground/70">incl. {money(r.gst)} GST · ex-GST {money(r.subtotal)}</p>
            <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {Object.entries(r.by_product).map(([p, v]) => <div key={p} className="flex justify-between"><span>{p}</span><span>{money(v)}</span></div>)}
            </div>
            {r.missing > 0 && <p className="text-[10.5px] text-amber-600 mt-1.5">{r.missing} line(s) unpriced</p>}
          </div>
        ))}
      </div>

      {/* Coverage comparison & recommendation */}
      <div className="border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold text-foreground">Coverage comparison & recommendation</h3>
          {!analysis && (
            <button onClick={compareBenefits} disabled={analyzing} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50">
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{analyzing ? 'Analysing coverage…' : 'Compare benefits with Opus'}
            </button>
          )}
        </div>
        {error && <p className="text-[11.5px] text-rose-600 mb-2">{error}</p>}
        {!analysis && !analyzing && <p className="text-[11.5px] text-muted-foreground/70">Opus aligns each plan&apos;s benefits, lists pros/cons per insurer, and recommends the best value.</p>}
        {analysis && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-primary/5 border-l-2 border-primary/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Recommendation</p>
              <p className="text-[12px] text-foreground/80 leading-relaxed m-0">{analysis.recommendation}</p>
            </div>
            {(analysis.comparison?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead><tr>
                    <th className="text-left px-2 py-1 border-b border-border text-muted-foreground/70 font-semibold">Benefit</th>
                    {insurerNames.map(n => <th key={n} className="text-left px-2 py-1 border-b border-border text-muted-foreground/70 font-semibold">{n}</th>)}
                  </tr></thead>
                  <tbody>
                    {analysis.comparison.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 border-b border-border/50 font-medium text-foreground/80">{row.benefit}</td>
                        {insurerNames.map(n => <td key={n} className="px-2 py-1 border-b border-border/50 text-muted-foreground">{row.by_insurer?.[n] ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min((analysis.insurers ?? []).length, 3)},minmax(0,1fr))` }}>
              {(analysis.insurers ?? []).map(ins => (
                <div key={ins.insurer} className="rounded-lg border border-border p-3">
                  <p className="text-[12px] font-bold text-foreground mb-1.5">{ins.insurer}</p>
                  {ins.pros?.map((p, i) => <p key={`p${i}`} className="text-[11px] text-emerald-700 flex gap-1 m-0"><span>+</span>{p}</p>)}
                  {ins.cons?.map((c, i) => <p key={`c${i}`} className="text-[11px] text-rose-600 flex gap-1 m-0"><span>−</span>{c}</p>)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Per-member breakdown */}
      {lines.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-muted/40 text-[12px] font-semibold">Per-member breakdown ({lines.length} lines)</div>
          <div className="max-h-[480px] overflow-y-auto divide-y divide-border/60 text-[11.5px]">
            {lines.map((l, i) => (
              <div key={i} className={cn('flex items-center gap-2 px-3 py-1', l.premium == null && 'bg-amber-50/60')}>
                <span className="w-40 truncate">{l.member_name} <span className="text-muted-foreground/50">({l.relationship})</span></span>
                <span className="w-24 text-muted-foreground/60">{l.insurer_name}</span>
                <span className="w-12 text-muted-foreground/60">{l.product_code}</span>
                <span className="w-20 text-muted-foreground/60">{l.plan_code ?? '—'}</span>
                <span className="w-14 text-muted-foreground/50">age {l.age ?? '?'}</span>
                <span className="flex-1 text-right font-medium">{l.premium != null ? money(l.premium) : <span className="text-amber-600">{l.note}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
