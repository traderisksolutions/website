'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Sparkles, Download, Reply, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThreadSelectorModal } from '@/components/group-benefits/ThreadSelectorModal'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import type { Recommendation, LegacyRecommendation } from '@/lib/gb-recommend'

type InsurerResult = { rate_table_id: string; insurer_id: string | null; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Line = { member_name: string; relationship: string; category: string; age: number | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null }
type Analysis = Recommendation | LegacyRecommendation
type Quotation = { id: string; company_name: string | null; effective_date: string | null; product_codes: string[]; member_count: number; results: InsurerResult[]; benefits_analysis: Analysis | null; priorities: string | null; created_at: string; source: string }

/** Old quotes stored the pre-redesign shape (single winner + per-insurer pros/cons) — detect it
 *  by the absence of `narrative` rather than crashing, and offer a one-click regenerate. Mirrors
 *  PmQuoteActions.tsx's isLegacy exactly. */
const isLegacy = (r: Analysis): r is LegacyRecommendation => !('narrative' in r)

const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState<Quotation | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [priorities, setPriorities] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachFormat, setAttachFormat] = useState<'xlsx' | 'csv'>('xlsx')
  const [showThreadPick, setShowThreadPick] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)

  async function prepareReply(leadId: string) {
    setPreparing('Generating files & drafting reply…')
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/prepare-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, insurers: byInsurer.map(r => r.insurer_name), format: attachFormat }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not prepare reply'); setPreparing(null); setShowThreadPick(false); return }
      router.push(`/engagement?lead=${leadId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed'); setPreparing(null); setShowThreadPick(false)
    }
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/quote/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const d = await res.json()
    setQ(d.quotation); setLines(d.lines ?? []); setAnalysis(d.quotation?.benefits_analysis ?? null)
    setPriorities(d.quotation?.priorities ?? '')
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

  async function compareBenefits() {
    setAnalyzing(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${id}/compare-benefits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priorities }),
      })
      const d = await res.json()
      if (res.ok && d.recommendation) setAnalysis(d.recommendation); else setError(d.error ?? 'Comparison failed')
    } finally { setAnalyzing(false) }
  }

  if (!q) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: '#202124' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <button onClick={() => router.push('/group-benefits')} className="inline-flex items-center gap-1.5 text-[14px] bg-transparent border-0 p-0 cursor-pointer hover:underline mb-3" style={{ color: '#5f6368' }}>← Pricing Matrix</button>

      <div className="mb-8">
        <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">{q.company_name || 'Untitled quote'}</h1>
        <p className="m-0 text-[13.5px] mt-2 tabular-nums" style={{ color: '#5f6368' }}>{q.member_count} members · {(q.product_codes ?? []).join('/')}{q.effective_date ? ` · eff ${q.effective_date}` : ''} · {new Date(q.created_at).toLocaleString('en-SG')}</p>
      </div>

      {/* Download / export — one file per insurer */}
      {byInsurer.length > 0 && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-foreground">Download quotes <span className="text-muted-foreground/60 font-normal">· one file per insurer</span></h3>
            <span className="text-[11px] text-muted-foreground/60">Download &amp; attach in your reply</span>
          </div>
          <div className="flex flex-col divide-y divide-border/60">
            {byInsurer.map(r => (
              <div key={r.insurer_name} className="flex items-center justify-between py-2">
                <span className="text-[12.5px] font-medium text-foreground">{r.insurer_name} <span className="text-muted-foreground/50 font-normal">· {money(r.total)}</span></span>
                <div className="flex items-center gap-2">
                  <a href={`/api/group-benefits/quote/${id}/export?format=xlsx&insurer=${encodeURIComponent(r.insurer_name)}`}
                     className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] text-[#202124] hover:bg-[#f8f9fa]"><Download size={13} /> XLSX</a>
                  <a href={`/api/group-benefits/quote/${id}/export?format=csv&insurer=${encodeURIComponent(r.insurer_name)}`}
                     className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40"><Download size={13} /> CSV</a>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
            <div className="inline-flex items-center gap-1.5 text-[11.5px]">
              <span className="text-muted-foreground/70">Attach as</span>
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                {(['xlsx', 'csv'] as const).map(f => (
                  <button key={f} onClick={() => setAttachFormat(f)}
                    className={cn('px-2.5 py-1 font-medium', attachFormat === f ? 'bg-[#202124] text-white' : 'text-muted-foreground hover:bg-muted/40')}>{f}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowThreadPick(true)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-[#202124] text-white hover:opacity-90">
              <Reply size={14} /> Reply to thread with attachments
            </button>
          </div>
        </div>
      )}

      {showThreadPick && <ThreadSelectorModal onPick={prepareReply} onClose={() => { if (!preparing) setShowThreadPick(false) }} busyLabel={preparing} />}

      {/* Comparison cards */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${Math.min(byInsurer.length, 4)}, minmax(0,1fr))` }}>
        {byInsurer.map((r, i) => (
          <div key={r.insurer_name} className={cn('rounded-xl border p-4', i === 0 ? 'border-[#202124] bg-white' : 'border-border bg-card')}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">{r.insurer_name}</span>
              {i === 0 && <span className="text-[11.5px] font-medium bg-[#f1f3f4] text-[#3c4043] px-2 py-0.5 rounded-[6px]">Lowest premium</span>}
            </div>
            <p className="text-[22px] font-bold text-foreground mt-1">{money(r.total)}</p>
            <p className="text-[10.5px] text-muted-foreground/70">incl. {money(r.gst)} GST · ex-GST {money(r.subtotal)}</p>
            <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {Object.entries(r.by_product).map(([p, v]) => <div key={p} className="flex justify-between"><span>{p}</span><span>{money(v)}</span></div>)}
            </div>
            {r.missing > 0 && <p className="text-[10.5px] text-[#3c4043] mt-1.5">{r.missing} line(s) unpriced</p>}
          </div>
        ))}
      </div>

      {/* Coverage comparison & recommendation */}
      <div className="border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold text-foreground">Coverage comparison & recommendation</h3>
          <button onClick={compareBenefits} disabled={analyzing} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-50">
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{analyzing ? 'Analysing coverage…' : analysis ? 'Regenerate' : 'Compare benefits with Opus'}
          </button>
        </div>
        <label className="text-[12px] flex flex-col gap-1 mb-2">
          <span className="text-muted-foreground/70">What matters to this client? <span className="text-muted-foreground/40">(optional — e.g. &ldquo;private hospital access, budget-conscious on outpatient&rdquo;)</span></span>
          <textarea value={priorities} onChange={e => setPriorities(e.target.value)} rows={2} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 resize-y" placeholder="Leave blank to optimise for overall value" />
        </label>
        {error && <p className="text-[11.5px] text-[#c5221f] mb-2">{error}</p>}
        {!analysis && !analyzing && <p className="text-[11.5px] text-muted-foreground/70">Opus compares price against what each plan actually covers, and writes one narrative weighing the trade-offs.</p>}

        {analysis && isLegacy(analysis) && (
          <div className="rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#3c4043]">This quote has an older-style recommendation (a single pick with pros/cons). Recompute it for the current side-by-side comparison format.</p>
            <button onClick={compareBenefits} disabled={analyzing} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white text-[#202124] border border-[#dadce0] hover:bg-[#f8f9fa] disabled:opacity-50 shrink-0">
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Recompute
            </button>
          </div>
        )}

        {analysis && !isLegacy(analysis) && (
          <div className="flex flex-col gap-3 mt-1">
            <div className="rounded-lg bg-[#f1f3f4] border border-[#e8eaed] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><Sparkles size={14} className="text-[#202124]" /> {analysis.headline}</div>
              <div className="flex flex-col gap-2 mt-2">
                {analysis.narrative.split(/\n\n+/).map((para, i) => <p key={i} className="text-[12.5px] text-foreground/80 leading-relaxed">{para}</p>)}
              </div>
            </div>
            {analysis.highlights?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {analysis.highlights.map(h => (
                  <div key={h.insurer} className="flex items-center gap-1.5 border border-border rounded-lg px-2.5 py-1.5">
                    <span className="text-[12px] font-semibold">{h.insurer}</span>
                    <span className="text-[11px] text-muted-foreground/70">— {h.note}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10.5px] text-muted-foreground/40">Premium figures come from each insurer&rsquo;s own approved rate table; the comparison narrative is Opus&rsquo;s qualitative read.</p>
          </div>
        )}
      </div>

      {/* Per-member breakdown */}
      {lines.length > 0 && (
        <section className="mb-8">
          <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em] leading-tight" style={{ color: '#202124' }}>Per-member breakdown</h2>
          <Register label="Per-member breakdown" minWidth={760} maxHeight="520px">
            <RegisterHead>
              <RegisterTh first width={260}>Member</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh>Product</RegisterTh>
              <RegisterTh>Plan</RegisterTh>
              <RegisterTh align="right">Age</RegisterTh>
              <RegisterTh last align="right">Premium</RegisterTh>
            </RegisterHead>
            <tbody>
              {lines.map((l, i) => (
                <RegisterRow key={i}>
                  <RegisterCell first primary={l.member_name} secondary={l.relationship} />
                  <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{l.insurer_name}</span></RegisterCell>
                  <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{l.product_code}</span></RegisterCell>
                  <RegisterCell><span className="text-[14px]" style={{ color: l.plan_code ? '#3c4043' : '#9aa0a6' }}>{l.plan_code ?? '—'}</span></RegisterCell>
                  <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: l.age != null ? '#3c4043' : '#9aa0a6' }}>{l.age ?? '—'}</span></RegisterCell>
                  <RegisterCell last align="right" nowrap={false}>
                    {l.premium != null ? <span className="text-[14px] font-medium tabular-nums" style={{ color: '#202124' }}>{money(l.premium)}</span> : <span className="block text-[13px] leading-snug" style={{ color: '#5f6368' }}>{l.note}</span>}
                  </RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </section>
      )}
    </div>
    </div>
  )
}
