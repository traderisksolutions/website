'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Network, Sparkles, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Btn, Chip, Empty, Spinner } from './primitives'
import { NexusSummary } from './NexusSummary'
import { CaseThreadPicker } from './CaseThreadPicker'
import { NexusPhasedAnalysisModal } from '@/components/nexus/NexusPhasedAnalysisModal'
import { fmtRelative, fmtDate } from '@/lib/crm/format'
import type { AiBrief, CaseRow, Company, CompanyThread, Person, Stage } from '@/lib/crm/types'

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
      const res = await fetch(`/api/companies/${company.id}/cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, threadIds: ids }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not create the case.')
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
        description="Groups of threads analysed together — a claim, a dispute, a multi-insurer renewal."
        actions={<Btn size="xs" level="primary" onClick={() => setPicking(true)}><Network size={12} /> Generate case analysis</Btn>}
      >
        {error && !picking && <p className="text-[12px] text-destructive m-0 mb-2">{error}</p>}
        {cases.length === 0 && <Empty compact>No cases yet. Press Generate case analysis and pick the emails that belong to one matter.</Empty>}
        <ul className="m-0 p-0 list-none flex flex-col">
          {cases.map(c => {
            const a = analyses[c.id]
            const sa = a?.structured_analysis
            const open = expanded === c.id
            return (
              <li key={c.id} className="py-2.5 border-b border-[--border-subtle] last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => { setExpanded(open ? null : c.id); void loadAnalysis(c.id) }}
                    className="min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <p className="text-[13px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
                      {open ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
                      <span className="truncate">{c.name}</span>
                      <Chip tone={c.status === 'open' ? 'green' : 'neutral'} className="capitalize">{c.status}</Chip>
                      {sa ? <Chip tone="blue">Analysed</Chip> : <Chip tone="neutral">No analysis</Chip>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 pl-[18px]">
                      {c.thread_count} thread{c.thread_count === 1 ? '' : 's'} · activity {fmtRelative(c.last_activity ?? c.updated_at)}
                    </p>
                  </button>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <Btn size="xs" level="secondary" onClick={() => setAnalysing({ caseId: c.id, threadIds: [] })}>
                      <Sparkles size={11} /> {sa ? 'Re-analyse' : 'Analyse'}
                    </Btn>
                    <Link href={`/nexus?case=${c.id}`} title="Open the full workspace" className="text-muted-foreground hover:text-primary"><ExternalLink size={13} /></Link>
                  </span>
                </div>

                {open && (
                  <div className="pl-[18px] mt-2">
                    {a === undefined && <Spinner label="Loading the analysis…" />}
                    {a === null && <p className="text-[12px] text-muted-foreground m-0">No analysis has been run for this case yet.</p>}
                    {sa && (
                      <div className="flex flex-col gap-2">
                        {sa.case_brief?.summary && <p className="text-[12.5px] leading-relaxed m-0">{sa.case_brief.summary}</p>}
                        {sa.case_brief?.current_stage && <p className="text-[12px] text-muted-foreground m-0">Stage: {sa.case_brief.current_stage}</p>}
                        {(sa.blocking_issues ?? []).length > 0 && (
                          <p className="text-[12px] m-0"><span className="text-muted-foreground">Blocking: </span>{(sa.blocking_issues ?? []).join(' · ')}</p>
                        )}
                        {(sa.recommended_next_steps ?? []).length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground m-0 mb-1">Next steps</p>
                            <ol className="m-0 pl-4 text-[12.5px] flex flex-col gap-0.5">
                              {(sa.recommended_next_steps ?? []).slice(0, 5).map((s, i) => (
                                <li key={i}>{s.action}{s.owner ? <span className="text-muted-foreground"> — {s.owner}</span> : null}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {(sa.scenario_analysis ?? []).length > 0 && (
                          <p className="text-[12px] m-0">
                            <span className="text-muted-foreground">Scenarios: </span>
                            {(sa.scenario_analysis ?? []).map(x => `${x.name}${x.probability ? ` (${x.probability})` : ''}`).join(' · ')}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground m-0">
                          {a?.created_at ? `Analysed ${fmtDate(a.created_at)}` : ''}{a?.strategy_model ? ` · ${a.strategy_model}` : ''}
                          {' · '}<Link href={`/nexus?case=${c.id}`} className="text-primary no-underline hover:underline">open the full analysis</Link>
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
