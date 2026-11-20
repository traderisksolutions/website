'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, Brain } from 'lucide-react'
import { SectionCard, Btn, Empty } from './primitives'
import { fmtDate } from '@/lib/format'
import { STAGE_LABEL, type AiBrief, type Company, type Person, type Stage } from '@/lib/crm/types'
import { unwrap } from '@/lib/action-result'
import { companyBrief } from '@/app/companies/[id]/actions'

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
      onBrief(unwrap(await companyBrief(company.id, !!deep)))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  const actions = (
    <>
      <Btn size="xs" level="secondary" onClick={() => run(false)} loading={busy === 'flash'} disabled={busy !== null}>
        {brief ? <RefreshCw size={12} /> : <Sparkles size={12} />} {brief ? 'Refresh' : 'Generate summary'}
      </Btn>
      <Btn size="xs" level="tertiary" onClick={() => run(true)} loading={busy === 'deep'} disabled={busy !== null} title="Slower and more thorough. Uses Claude Opus.">
        <Brain size={12} /> Deep analysis
      </Btn>
    </>
  )

  return (
    <SectionCard
      title="Nexus summary"
      actions={actions}
    >
      {error && <p className="text-body mb-2 m-0 text-trs-neg">{error}</p>}
      {!brief && !busy && <Empty compact>No summary yet. Generate one to read the whole relationship at once.</Empty>}
      {!brief && busy && <Empty compact>Reading the threads, payments and quotes…</Empty>}

      {brief && (
        <div className="flex flex-col gap-3">
          <p className="text-body leading-relaxed m-0 text-trs-ink">{brief.summary}</p>
          {brief.relationship && <p className="text-body m-0 text-trs-muted">{brief.relationship}</p>}

          {stakeholders.length > 0 && (
            <p className="text-body m-0 text-trs-ink">
              <span className="text-trs-muted">Stakeholders: </span>
              {stakeholders.map((p, i) => (
                <span key={p.email}>
                  {i > 0 && <span className="text-trs-muted"> · </span>}
                  <span title={`${p.email} · wrote ${p.sent}, addressed ${p.received}, copied ${p.cc}`}>
                    {p.name ?? p.email}
                    {p.isPrimary && <span className="text-trs-muted"> (point person)</span>}
                  </span>
                </span>
              ))}
            </p>
          )}

          {brief.suggested_stage && brief.suggested_stage !== company.stage && (
            <p className="text-body m-0 text-trs-ink">
              <span className="text-trs-muted">Suggested stage: </span>
              <span className="font-medium">{STAGE_LABEL[brief.suggested_stage]}</span>
              <Btn size="xs" level="tertiary" onClick={() => onApplyStage(brief.suggested_stage!)} className="ml-2">Apply</Btn>
            </p>
          )}

          {brief.risks.length > 0 && (
            <p className="text-body m-0 text-trs-ink"><span className="text-trs-muted">Risks: </span>{brief.risks.join(' · ')}</p>
          )}
          {brief.upcoming.length > 0 && (
            <p className="text-body m-0 text-trs-ink"><span className="text-trs-muted">Upcoming: </span>{brief.upcoming.map(u => `${u.what}${u.when ? ` (${fmtDate(u.when)})` : ''}`).join(' · ')}</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}
