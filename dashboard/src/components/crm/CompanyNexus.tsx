'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Network, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'
import { SectionCard, Btn, Chip, Empty, Spinner } from './primitives'
import { NexusSummary } from './NexusSummary'
import { CaseThreadPicker } from './CaseThreadPicker'
import { NexusPhasedAnalysisModal } from '@/components/nexus/NexusPhasedAnalysisModal'
import { fmtRelative, fmtDate } from '@/lib/format'
import type { AiBrief, CaseRow, Company, CompanyThread, Person, Stage } from '@/lib/crm/types'
import { createCase } from '@/app/companies/[id]/actions'

/**
 * Nexus for one company: the whole-relationship summary, the cases already opened, and a picker
 * to combine threads into a new case and analyse them together. Everything the Nexus workspace
 * does for a case, reached from the client it belongs to.
 */

type CaseAnalysis = {
  structured_analysis?: {
    case_brief?: { summary?: string; current_stage?: string }
    recommended_next_steps?: { step?: number; action?: string; owner?: string }[]
    scenario_analysis?: { name?: string; probability?: string }[]
    blocking_issues?: string[]
  } | null
  created_at?: string
  strategy_model?: string | null
}


export function CompanyNexus({ company, threads, cases, stakeholders, summaryStale, userEmail, onBrief, onApplyStage, onCasesChanged }: {
  company: Company
  threads: CompanyThread[]
  cases: CaseRow[]
  stakeholders: Person[]
  summaryStale: boolean
  userEmail: string | null
  onBrief: (b: AiBrief) => void
  onApplyStage: (s: Stage) => Promise<void>
  onCasesChanged: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysing, setAnalysing] = useState<{ caseId: string; threadIds: string[] } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<Record<string, CaseAnalysis | null>>({})

  const loadAnalysis = useCallback(async (caseId: string) => {
    if (caseId in analyses) return
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}`, { cache: 'no-store' })
      const d = await res.json()
      setAnalyses(prev => ({ ...prev, [caseId]: res.ok ? (d.analysis ?? null) : null }))
    } catch { setAnalyses(prev => ({ ...prev, [caseId]: null })) }
  }, [analyses])

  useEffect(() => { for (const c of cases.slice(0, 3)) void loadAnalysis(c.id) }, [cases, loadAnalysis])

  async function generate(ids: string[], typedName: string) {
    if (ids.length === 0) return
    setCreating(true); setError(null)
    try {
      const name = typedName || defaultCaseName(threads, ids, company.name)
      const r = await createCase(company.id, { name, threadIds: ids })
      if (!r.ok) throw new Error(r.error)
      const d = r.data
      setPicking(false)
      onCasesChanged()
      setAnalysing({ caseId: d.id, threadIds: ids })   // straight into the analysis
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setCreating(false) }
  }

  return (
    <>
      <NexusSummary
        company={company}
        stakeholders={stakeholders}
        stale={summaryStale}
        onBrief={onBrief}
        onApplyStage={onApplyStage}
      />

      <SectionCard
        title="Cases"
        actions={<Btn size="xs" level="secondary" onClick={() => setPicking(true)}><Network size={12} /> Generate case analysis</Btn>}
      >
        {error && !picking && <p className="text-body m-0 mb-2 text-trs-neg">{error}</p>}
        {cases.length === 0 && <Empty compact>No cases yet. Press Generate case analysis and pick the emails that belong to one matter.</Empty>}
        <ul className="m-0 p-0 list-none flex flex-col">
          {cases.map(c => {
            const a = analyses[c.id]
            const sa = a?.structured_analysis
            const open = expanded === c.id
            return (
              <li key={c.id} className="py-3 border-b border-trs-line last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => { setExpanded(open ? null : c.id); void loadAnalysis(c.id) }}
                    className="min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <p className="text-body font-medium m-0 flex items-center gap-2 flex-wrap text-trs-ink">
                      {open ? <ChevronDown size={14} className="text-trs-muted" /> : <ChevronRight size={14} className="text-trs-muted" />}
                      <span className="truncate">{c.name}</span>
                      <Chip className="capitalize">{c.status}</Chip>
                      {sa ? <Chip>Analysed</Chip> : <Chip>No analysis</Chip>}
                    </p>
                    <p className="text-body m-0 mt-0.5 pl-[22px] text-trs-muted">
                      {c.thread_count} thread{c.thread_count === 1 ? '' : 's'} · activity {fmtRelative(c.last_activity ?? c.updated_at)}
                    </p>
                  </button>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <Btn size="xs" level="secondary" onClick={() => setAnalysing({ caseId: c.id, threadIds: [] })}>
                      <Sparkles size={11} /> {sa ? 'Re-analyse' : 'Analyse'}
                    </Btn>
                    <Link href={`/nexus/cases?case=${c.id}`} className="text-body no-underline hover:underline whitespace-nowrap text-trs-muted">Open</Link>
                  </span>
                </div>

                {open && (
                  <div className="pl-[22px] mt-3">
                    {a === undefined && <Spinner label="Loading the analysis…" />}
                    {a === null && <p className="text-body m-0 text-trs-muted">No analysis has been run for this case yet.</p>}
                    {sa && (
                      <div className="flex flex-col gap-2">
                        {sa.case_brief?.summary && <p className="text-body leading-relaxed m-0 text-trs-ink">{sa.case_brief.summary}</p>}
                        {sa.case_brief?.current_stage && <p className="text-body m-0 text-trs-muted">Stage: {sa.case_brief.current_stage}</p>}
                        {(sa.blocking_issues ?? []).length > 0 && (
                          <p className="text-body m-0 text-trs-ink"><span className="text-trs-muted">Blocking: </span>{(sa.blocking_issues ?? []).join(' · ')}</p>
                        )}
                        {(sa.recommended_next_steps ?? []).length > 0 && (
                          <div>
                            <p className="text-small m-0 mb-1 text-trs-muted">Next steps</p>
                            <ol className="m-0 pl-4 text-body flex flex-col gap-0.5 text-trs-ink">
                              {(sa.recommended_next_steps ?? []).slice(0, 5).map((s, i) => (
                                <li key={i}>{s.action}{s.owner ? <span className="text-trs-muted"> — {s.owner}</span> : null}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {(sa.scenario_analysis ?? []).length > 0 && (
                          <p className="text-body m-0 text-trs-ink">
                            <span className="text-trs-muted">Scenarios: </span>
                            {(sa.scenario_analysis ?? []).map(x => `${x.name}${x.probability ? ` (${x.probability})` : ''}`).join(' · ')}
                          </p>
                        )}
                        <p className="text-small m-0 text-trs-muted">
                          {a?.created_at ? `Analysed ${fmtDate(a.created_at)}` : ''}{a?.strategy_model ? ` · ${a.strategy_model}` : ''}
                          {' · '}<Link href={`/nexus/cases?case=${c.id}`} className="underline underline-offset-4 text-trs-ink">Open the full analysis</Link>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </SectionCard>

      <CaseThreadPicker
        open={picking}
        onClose={() => { setPicking(false); setError(null) }}
        threads={threads}
        companyName={company.name}
        busy={creating}
        error={picking ? error : null}
        onGenerate={generate}
      />

      {analysing && (
        <NexusPhasedAnalysisModal
          caseId={analysing.caseId}
          userEmail={userEmail}
          initialThreadIds={analysing.threadIds.length ? analysing.threadIds : null}
          onClose={() => setAnalysing(null)}
          onComplete={() => { setAnalysing(null); setAnalyses({}); onCasesChanged() }}
        />
      )}
    </>
  )
}

/** "Acme — renewal" from the threads chosen, so a case is never called "Untitled". */
function defaultCaseName(threads: CompanyThread[], ids: string[], companyName: string): string {
  const picked = threads.filter(t => ids.includes(t.id))
  const cats = Array.from(new Set(picked.map(t => t.category).filter(Boolean))) as string[]
  if (cats.length === 1) return `${companyName} — ${cats[0]}`
  const first = picked[0]?.subject?.replace(/^((re|fw|fwd)\s*:\s*)+/i, '').trim()
  return first ? `${companyName} — ${first.slice(0, 60)}` : `${companyName} — case`
}
