'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, Brain, Star } from 'lucide-react'
import { SectionCard, Btn, Empty } from './primitives'
import { fmtRelative, fmtDate } from '@/lib/crm/format'
import { STAGE_LABEL, type AiBrief, type Company, type Person, type Stage } from '@/lib/crm/types'

/**
 * "Nexus summary" — one read across every thread with this company, plus who the stakeholders
 * are. Refreshed by hand only (Gemini Flash), with Opus behind an explicit Deep analysis.
 */
export function NexusSummary({ company, stakeholders, stale, onBrief, onApplyStage }: {
  company: Company
  stakeholders: Person[]
  stale: boolean
  onBrief: (b: AiBrief) => void
  onApplyStage: (s: Stage) => Promise<void>
}) {
  const [busy, setBusy] = useState<'flash' | 'deep' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const brief = company.ai_brief

  async function run(deep: boolean) {
    setBusy(deep ? 'deep' : 'flash'); setError(null)
    try {
      const res = await fetch(`/api/companies/${company.id}/brief`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deep }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'The summary could not be generated.')
      onBrief(d.brief)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  const actions = (
    <>
      <Btn size="xs" level={brief ? 'tertiary' : 'primary'} onClick={() => run(false)} loading={busy === 'flash'} disabled={busy !== null}>
        {brief ? <RefreshCw size={12} /> : <Sparkles size={12} />} {brief ? 'Refresh' : 'Generate'}
      </Btn>
      <Btn size="xs" level="tertiary" onClick={() => run(true)} loading={busy === 'deep'} disabled={busy !== null} title="Slower and more thorough. Uses Claude Opus.">
        <Brain size={12} /> Deep analysis
      </Btn>
    </>
  )

  return (
    <SectionCard
      title="Nexus summary"
      description={brief ? `${brief.deep ? 'Deep analysis' : 'Quick read'} · ${fmtRelative(brief.generated_at)}${stale ? ' · newer emails have arrived since' : ''}` : 'Every thread with this company, read together.'}
      actions={actions}
    >
      {error && <p className="text-[12px] text-destructive mb-2 m-0">{error}</p>}
      {!brief && !busy && <Empty compact>No summary yet. Generate one to read the whole relationship at once.</Empty>}
      {!brief && busy && <Empty compact>Reading the threads, payments and quotes…</Empty>}

      {brief && (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-foreground m-0">{brief.summary}</p>
          {brief.relationship && <p className="text-[12.5px] text-muted-foreground m-0">{brief.relationship}</p>}

          {stakeholders.length > 0 && (
            <p className="text-[12.5px] m-0">
              <span className="text-muted-foreground">Stakeholders: </span>
              {stakeholders.map((p, i) => (
                <span key={p.email}>
                  {i > 0 && <span className="text-muted-foreground"> · </span>}
                  <span title={`${p.email} · wrote ${p.sent}, addressed ${p.received}, copied ${p.cc}`}>
                    {p.name ?? p.email}
                    {p.isPrimary && <Star size={10} className="inline ml-1 -mt-0.5" style={{ color: 'var(--success)' }} aria-label="point person" />}
                  </span>
                </span>
              ))}
            </p>
          )}

          {brief.suggested_stage && brief.suggested_stage !== company.stage && (
            <p className="text-[12.5px] m-0">
              <span className="text-muted-foreground">Suggested stage: </span>
              <strong>{STAGE_LABEL[brief.suggested_stage]}</strong>
              <button onClick={() => onApplyStage(brief.suggested_stage!)} className="ml-2 text-[12px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline">Apply</button>
            </p>
          )}

          {brief.risks.length > 0 && (
            <p className="text-[12.5px] m-0"><span className="text-muted-foreground">Risks: </span>{brief.risks.join(' · ')}</p>
          )}
          {brief.upcoming.length > 0 && (
            <p className="text-[12.5px] m-0"><span className="text-muted-foreground">Upcoming: </span>{brief.upcoming.map(u => `${u.what}${u.when ? ` (${fmtDate(u.when)})` : ''}`).join(' · ')}</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}
