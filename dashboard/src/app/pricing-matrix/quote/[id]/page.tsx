'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Sparkles, Download, Reply, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThreadSelectorModal } from '@/components/group-benefits/ThreadSelectorModal'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { BenefitComparison } from '@/components/group-benefits/BenefitComparison'
import type { Comparison } from '@/lib/gb/compare'

type InsurerResult = { rate_table_id: string; insurer_id: string | null; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Line = { member_name: string; relationship: string; category: string; age: number | null; insurer_name: string; product_code: string; plan_code: string | null; premium: number | null; note: string | null }
type Quotation = { id: string; company_name: string | null; effective_date: string | null; product_codes: string[]; member_count: number; results: InsurerResult[]; benefits_analysis: Comparison | null; created_at: string; source: string }

/** Quotes compared before 2 Oct 2026 hold generated prose, not a comparison. Detect that by the
 *  absence of the comparison's own shape and offer a recompare, rather than rendering a narrative
 *  this page no longer produces. */
const isComparison = (a: unknown): a is Comparison =>
  !!a && typeof a === 'object' && Array.isArray((a as Comparison).groups) && Array.isArray((a as Comparison).premium)

const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState<Quotation | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [analysis, setAnalysis] = useState<Comparison | null>(null)
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const d = await res.json()
      if (res.ok && d.comparison) setAnalysis(d.comparison as Comparison); else setError(d.error ?? 'Comparison failed')
    } finally { setAnalyzing(false) }
  }

  if (!q) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: '#202124' }}>
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <button onClick={() => router.push('/pricing-matrix')} className="inline-flex items-center gap-1.5 text-[14px] bg-transparent border-0 p-0 cursor-pointer hover:underline mb-3" style={{ color: '#5f6368' }}>← Pricing Matrix</button>

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

      {/* Benefit comparison */}
      {isComparison(analysis) ? (
        <div className="mb-6">
          <BenefitComparison comparison={analysis} busy={analyzing} onRecompute={() => compareBenefits()} />
          {error && <p className="text-[11.5px] mt-2" style={{ color: '#c5221f' }}>{error}</p>}
        </div>
      ) : (
        <div className="border border-border rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-[13px] font-bold text-foreground">Benefit comparison</h3>
            <button onClick={compareBenefits} disabled={analyzing}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-50">
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {analyzing ? 'Comparing…' : analysis ? 'Recompare' : 'Compare benefits'}
            </button>
          </div>
          {analysis && !isComparison(analysis) && (
            <p className="text-[12px] mt-2" style={{ color: '#3c4043' }}>
              This quote holds a written comparison from before 2 Oct 2026. Recompare it for the side-by-side table.
            </p>
          )}
          {error && <p className="text-[11.5px] mt-2" style={{ color: '#c5221f' }}>{error}</p>}
        </div>
      )}

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
