'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Sparkles, Loader2, Reply, FileText, ListChecks, RefreshCw } from 'lucide-react'
import { ThreadSelectorModal } from '@/components/pricing-matrix/ThreadSelectorModal'
import type { QuoteResult } from '@/lib/pm-quote'
import type { Recommendation, LegacyRecommendation } from '@/lib/pm-recommend'

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

/** Old quotes stored the pre-redesign shape (single winner + per-insurer pros/cons) — detect it by
 *  the absence of `narrative` rather than crashing on missing fields, and offer a one-click
 *  regenerate (cheap, on-demand, no backfill migration needed for the jsonb column). */
const isLegacy = (r: Recommendation | LegacyRecommendation): r is LegacyRecommendation => !('narrative' in r)

export function PmQuoteActions({ quoteId, results, initialRecommendation, initialPriorities }: {
  quoteId: string; results: QuoteResult
  initialRecommendation?: Recommendation | LegacyRecommendation | null; initialPriorities?: string | null
}) {
  const router = useRouter()
  const [priorities, setPriorities] = useState(initialPriorities ?? '')
  const [rec, setRec] = useState<Recommendation | LegacyRecommendation | null>(initialRecommendation ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showThreadPick, setShowThreadPick] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)

  const priced = results.insurers.filter(i => !i.error)

  async function prepareReply(leadId: string) {
    setPreparing('Generating CSVs & drafting reply…'); setError(null)
    const res = await fetch(`/api/pricing-matrix/quote/${quoteId}/prepare-reply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId }),
    })
    const d = await safeJson<{ lead_id?: string }>(res)
    if (!res.ok || !d.lead_id) { setError(d.error ?? 'Could not prepare the reply'); setPreparing(null); setShowThreadPick(false); return }
    router.push(`/engagement?lead=${d.lead_id}`)
  }

  async function getRec() {
    setBusy(true); setError(null)
    const res = await fetch(`/api/pricing-matrix/quote/${quoteId}/recommend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priorities }) })
    const d = await safeJson<{ recommendation?: Recommendation }>(res)
    if (!res.ok || !d.recommendation) setError(d.error ?? 'Recommendation failed')
    else setRec(d.recommendation)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Downloads + reply */}
      <section className="border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-[13px] font-semibold">Download quotes <span className="font-normal text-muted-foreground/60">— one CSV per insurer</span></h2>
          <button onClick={() => setShowThreadPick(true)} disabled={priced.length === 0} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Reply size={14} /> Reply in Engagement
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {priced.map(ins => (
            <a key={ins.calculator_id} href={`/api/pricing-matrix/quote/${quoteId}/export?insurer=${ins.calculator_id}&format=csv`}
              className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg border border-border hover:bg-muted">
              <Download size={13} /> {ins.insurer_name}.csv
            </a>
          ))}
          {priced.length > 0 && (
            <a href={`/api/pricing-matrix/quote/${quoteId}/export-comparison`}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5">
              <FileText size={13} /> Client comparison (PDF)
            </a>
          )}
          {priced.length > 0 && (
            <a href={`/api/pricing-matrix/quote/${quoteId}/export-audit`}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
              <ListChecks size={13} /> Audit trail (PDF)
            </a>
          )}
        </div>
        <p className="text-[10.5px] text-muted-foreground/40 mt-2">Reply attaches one CSV per insurer + the comparison in the email body; pick which thread to reply to.</p>
      </section>

      {/* Recommendation */}
      <section className="border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold flex items-center gap-1.5"><Sparkles size={14} className="text-primary" /> Recommendation</h2>
          <button onClick={getRec} disabled={busy || priced.length === 0} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {rec ? 'Regenerate' : 'Get recommendation'}
          </button>
        </div>
        <label className="text-[12px] flex flex-col gap-1">
          <span className="text-muted-foreground/70">What matters to this client? <span className="text-muted-foreground/40">(optional — e.g. &ldquo;private hospital access, budget-conscious on outpatient&rdquo;)</span></span>
          <textarea value={priorities} onChange={e => setPriorities(e.target.value)} rows={2} className="text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 resize-y" placeholder="Leave blank to optimise for overall value" />
        </label>

        {error && <p className="text-[12px] text-rose-600">{error}</p>}

        {rec && isLegacy(rec) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[12px] text-amber-800">This quote has an older-style recommendation (a single pick with pros/cons). Recompute it for the current side-by-side comparison format.</p>
            <button onClick={getRec} disabled={busy} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shrink-0">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Recompute
            </button>
          </div>
        )}

        {rec && !isLegacy(rec) && (
          <div className="flex flex-col gap-3 mt-1">
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><Sparkles size={14} className="text-primary" /> {rec.headline}</div>
              <div className="flex flex-col gap-2 mt-2">
                {rec.narrative.split(/\n\n+/).map((para, i) => <p key={i} className="text-[12.5px] text-foreground/80 leading-relaxed">{para}</p>)}
              </div>
            </div>
            {rec.highlights?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rec.highlights.map(h => (
                  <div key={h.insurer} className="flex items-center gap-1.5 border border-border rounded-lg px-2.5 py-1.5">
                    <span className="text-[12px] font-semibold">{h.insurer}</span>
                    <span className="text-[11px] text-muted-foreground/70">— {h.note}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10.5px] text-muted-foreground/40">Premium figures come from each insurer&rsquo;s own calculator; the comparison narrative is Opus&rsquo;s qualitative read.</p>
          </div>
        )}
      </section>

      {showThreadPick && <ThreadSelectorModal onPick={prepareReply} onClose={() => { if (!preparing) setShowThreadPick(false) }} busyLabel={preparing} />}
    </div>
  )
}
