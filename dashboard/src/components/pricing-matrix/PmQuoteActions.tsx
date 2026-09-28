'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, FileText, ListChecks } from 'lucide-react'
import { ThreadSelectorModal } from '@/components/pricing-matrix/ThreadSelectorModal'
import type { QuoteResult } from '@/lib/pm-quote'
import type { Recommendation, LegacyRecommendation } from '@/lib/pm-recommend'
import { Btn, Chip, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const linkBtn = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[13.5px] font-medium bg-white no-underline hover:bg-[#f8f9fa]'

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
    setPreparing('Generating CSVs and drafting the reply…'); setError(null)
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
    <div className="flex flex-col" style={{ color: INK }}>
      {/* Downloads + reply */}
      <section className="py-6" style={{ borderTop: `1px solid ${RULE}` }}>
        <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight">Downloads</h2>
          <Btn level="primary" onClick={() => setShowThreadPick(true)} disabled={priced.length === 0} title="Attaches one CSV per insurer and the comparison in the email body. Pick the thread to reply to.">Send in Engagement</Btn>
        </header>
        <div className="flex flex-wrap gap-2">
          {priced.map(ins => (
            <a key={ins.calculator_id} href={`/api/pricing-matrix/quote/${quoteId}/export?insurer=${ins.calculator_id}&format=csv`} className={linkBtn} style={{ border: '1px solid #dadce0', color: INK }}>
              <Download size={13} /> {ins.insurer_name}.csv
            </a>
          ))}
          {priced.length > 0 && (
            <a href={`/api/pricing-matrix/quote/${quoteId}/export-comparison`} className={linkBtn} style={{ border: '1px solid #dadce0', color: INK }}>
              <FileText size={13} /> Client comparison, PDF
            </a>
          )}
          {priced.length > 0 && (
            <a href={`/api/pricing-matrix/quote/${quoteId}/export-audit`} className={linkBtn} style={{ border: '1px solid #dadce0', color: INK }}>
              <ListChecks size={13} /> Audit trail, PDF
            </a>
          )}
        </div>
      </section>

      {/* Recommendation */}
      <section className="py-6 flex flex-col gap-4" style={{ borderTop: `1px solid ${RULE}` }}>
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight">Recommendation</h2>
          <Btn level="secondary" onClick={getRec} disabled={busy || priced.length === 0} loading={busy}>{rec ? 'Regenerate' : 'Get recommendation'}</Btn>
        </header>
        <label className="block max-w-[720px]">
          <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>Client priorities</span>
          <textarea value={priorities} onChange={e => setPriorities(e.target.value)} rows={2} className={textareaCls} placeholder="e.g. private hospital access, budget-conscious on outpatient. Blank optimises for overall value." />
        </label>

        {error && <p role="alert" className="m-0 text-[13.5px]" style={{ color: '#3c4043' }}>{error}</p>}

        {rec && isLegacy(rec) && (
          <div className="flex items-center justify-between gap-3 flex-wrap py-3" style={{ borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
            <p className="m-0 text-[13.5px]" style={{ color: '#3c4043' }}>This quote has an older-style recommendation. Recompute it for the side-by-side format.</p>
            <Btn level="secondary" onClick={getRec} disabled={busy} loading={busy}>Recompute</Btn>
          </div>
        )}

        {rec && !isLegacy(rec) && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[16px] px-6 py-5" style={{ background: '#f1f3f4' }}>
              <p className="m-0 text-[16px] font-medium tracking-[-0.01em]">{rec.headline}</p>
              <div className="flex flex-col gap-2 mt-3">
                {rec.narrative.split(/\n\n+/).map((para, i) => <p key={i} className="m-0 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>{para}</p>)}
              </div>
            </div>
            {rec.highlights?.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col">
                {rec.highlights.map(h => (
                  <li key={h.insurer} className="flex items-baseline gap-2.5 py-2.5 text-[14px]" style={{ borderBottom: `1px solid ${RULE}` }}>
                    <Chip>{h.insurer}</Chip>
                    <span style={{ color: '#3c4043' }}>{h.note}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Premiums come from each insurer&rsquo;s own calculator. The narrative is Opus&rsquo;s qualitative read.</p>
          </div>
        )}
      </section>

      {showThreadPick && <ThreadSelectorModal onPick={prepareReply} onClose={() => { if (!preparing) setShowThreadPick(false) }} busyLabel={preparing} />}
      {preparing && !showThreadPick && <p className="m-0 text-[13px] inline-flex items-center gap-1.5" style={{ color: MUTED }}><Loader2 size={13} className="animate-spin" /> {preparing}</p>}
    </div>
  )
}
