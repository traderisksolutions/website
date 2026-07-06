'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productLineLabel } from '@/lib/product-lines'

/**
 * Nexus RFQ view — READ-ONLY aggregate. The sending workflow lives in Engagement;
 * here we only make sense of it: quote comparison across insurers, and a Link →
 * into each conversation. No pick / draft / send / chase.
 */

interface Dispatch {
  id:           string
  insurer_name: string | null
  to_email:     string
  status:       string
  thread_id:    string | null
  created_at:   string
  updated_at?:  string
}
interface RfqRequest {
  id:               string
  product_line:     string
  insured_name:     string | null
  client_thread_id: string | null
  dispatches:       Dispatch[]
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Quote comparison (AI-extracted from insurer replies) ───────────────────────

type Quote = {
  insurer_name: string; product_line: string
  premium: string | null; excess: string | null; key_terms: string[]; validity: string | null; summary: string | null
}

function QuotesComparison({ caseId }: { caseId: string }) {
  const [quotes,  setQuotes]  = useState<Quote[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function compare() {
    setLoading(true)
    try {
      const res = await fetch('/api/nexus/rfq/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: caseId }),
      })
      setQuotes(res.ok ? await res.json() : [])
    } finally { setLoading(false) }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-indigo-900">Quote comparison</span>
        <button onClick={compare} disabled={loading} className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50">
          {loading ? 'Reading replies…' : quotes ? 'Refresh' : 'Compare quotes'}
        </button>
      </div>
      {quotes && quotes.length === 0 && <p className="text-[11.5px] text-muted-foreground">No insurer replies to compare yet.</p>}
      {quotes && quotes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="py-1.5 pr-3 font-semibold">Insurer</th><th className="py-1.5 pr-3 font-semibold">Line</th>
                <th className="py-1.5 pr-3 font-semibold">Premium</th><th className="py-1.5 pr-3 font-semibold">Excess</th>
                <th className="py-1.5 pr-3 font-semibold">Validity</th><th className="py-1.5 font-semibold">Key terms</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, i) => (
                <tr key={i} className="border-t border-indigo-200/50 align-top">
                  <td className="py-2 pr-3 font-medium text-foreground">{q.insurer_name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.product_line}</td>
                  <td className="py-2 pr-3 font-semibold text-foreground">{q.premium ?? '—'}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.excess ?? '—'}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.validity ?? '—'}</td>
                  <td className="py-2 text-muted-foreground">{q.key_terms.length > 0 ? q.key_terms.join(' · ') : (q.summary ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function LinkToEngagement({ threadId }: { threadId: string | null }) {
  if (!threadId) return null
  return (
    <a
      href={`/engagement?lead=${threadId}`}
      className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary hover:underline flex-shrink-0"
      title="Open this conversation in Engagement"
    >
      Link <ExternalLink size={10} />
    </a>
  )
}

export default function RfqPanel({ caseId }: { caseId: string }) {
  const [requests, setRequests] = useState<RfqRequest[] | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/nexus/rfq/requests?case_id=${caseId}`, { cache: 'no-store' })
    setRequests(res.ok ? await res.json() : [])
  }, [caseId])

  useEffect(() => { load() }, [load])

  if (requests === null) return <div className="p-6 text-[12px] text-muted-foreground">Loading quotation requests…</div>
  if (requests.length === 0) return <div className="p-6 text-[12px] text-muted-foreground/60">No quotation lines on this file.</div>

  const anyReplied = requests.some(r => r.dispatches.some(d => d.status === 'replied'))

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">Quotation Requests</h3>
        <span className="text-[11px] text-muted-foreground/60">
          {requests.length} line{requests.length !== 1 ? 's' : ''} · insured: {requests[0].insured_name || '—'} · view-only — send from Engagement
        </span>
      </div>

      {anyReplied && <QuotesComparison caseId={caseId} />}

      {requests.map(r => (
        <div key={r.id} className="rounded-lg border border-[--border-subtle] bg-card p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-foreground">{productLineLabel(r.product_line)}</span>
            <LinkToEngagement threadId={r.client_thread_id} />
          </div>
          {r.dispatches.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground/70">Not yet sent to any insurer.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {r.dispatches.map(d => {
                const replied = d.status === 'replied'
                const waited  = daysSince(d.updated_at || d.created_at)
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('text-[9.5px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 border flex-shrink-0',
                        replied ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200')}>
                        {replied ? 'replied' : 'sent'}
                      </span>
                      <span className="font-medium text-foreground truncate">{d.insurer_name || d.to_email}</span>
                      {!replied && <span className="text-[10.5px] text-muted-foreground/60 flex-shrink-0">⏳ {waited}d</span>}
                    </div>
                    <LinkToEngagement threadId={d.thread_id} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
