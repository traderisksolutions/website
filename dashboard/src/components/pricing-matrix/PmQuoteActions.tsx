'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Sparkles, Loader2, Trophy, ThumbsUp, ThumbsDown, Reply } from 'lucide-react'
import { ThreadSelectorModal } from '@/components/pricing-matrix/ThreadSelectorModal'
import type { QuoteResult } from '@/lib/pm-quote'
import type { Recommendation } from '@/lib/pm-recommend'

async function safeJson<T>(r: Response): Promise<T & { error?: string }> {
  try { return await r.json() } catch { return { error: `HTTP ${r.status}` } as T & { error?: string } }
}

export function PmQuoteActions({ quoteId, results, initialRecommendation, initialPriorities }: {
  quoteId: string; results: QuoteResult
  initialRecommendation?: Recommendation | null; initialPriorities?: string | null
}) {
  const router = useRouter()
  const [priorities, setPriorities] = useState(initialPriorities ?? '')
  const [rec, setRec] = useState<Recommendation | null>(initialRecommendation ?? null)
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

        {rec && (
          <div className="flex flex-col gap-3 mt-1">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-800"><Trophy size={15} /> {rec.recommendation}</div>
              {rec.headline && <p className="text-[12.5px] text-emerald-900/80 mt-0.5">{rec.headline}</p>}
              {rec.rationale && <p className="text-[12px] text-foreground/70 mt-1.5">{rec.rationale}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {rec.per_insurer?.map(p => (
                <div key={p.insurer} className={`border rounded-lg p-2.5 ${p.insurer === rec.recommendation ? 'border-emerald-300 bg-emerald-50/40' : 'border-border'}`}>
                  <p className="text-[12.5px] font-semibold">{p.insurer}</p>
                  {p.best_for && <p className="text-[11px] text-muted-foreground/70 mb-1.5">Best for: {p.best_for}</p>}
                  {p.pros?.length > 0 && <ul className="flex flex-col gap-0.5 mb-1.5">{p.pros.map((x, i) => <li key={i} className="text-[11px] text-emerald-800/90 flex items-start gap-1"><ThumbsUp size={11} className="mt-0.5 flex-shrink-0" />{x}</li>)}</ul>}
                  {p.cons?.length > 0 && <ul className="flex flex-col gap-0.5">{p.cons.map((x, i) => <li key={i} className="text-[11px] text-rose-700/80 flex items-start gap-1"><ThumbsDown size={11} className="mt-0.5 flex-shrink-0" />{x}</li>)}</ul>}
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-muted-foreground/40">Premium figures come from each insurer&rsquo;s own calculator; the recommendation is Opus&rsquo;s qualitative read.</p>
          </div>
        )}
      </section>

      {showThreadPick && <ThreadSelectorModal onPick={prepareReply} onClose={() => { if (!preparing) setShowThreadPick(false) }} busyLabel={preparing} />}
    </div>
  )
}
