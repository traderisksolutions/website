'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Network, Sparkles, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Btn, Chip, Empty, Spinner, Segmented, inputCls } from './primitives'
import { NexusSummary } from './NexusSummary'
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

const CAT_TONE: Record<string, 'blue' | 'red' | 'amber' | 'neutral'> = { rfq: 'blue', claim: 'red', renewal: 'amber', general: 'neutral', other: 'neutral' }
type Filter = 'all' | 'rfq' | 'claim' | 'renewal' | 'general'

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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [caseName, setCaseName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysing, setAnalysing] = useState<{ caseId: string; threadIds: string[] } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<Record<string, CaseAnalysis | null>>({})

  const counts = useMemo(() => ({
    all: threads.length,
    rfq: threads.filter(t => t.category === 'rfq').length,
    claim: threads.filter(t => t.category === 'claim').length,
    renewal: threads.filter(t => t.category === 'renewal').length,
    general: threads.filter(t => !t.category || t.category === 'general' || t.category === 'other').length,
  }), [threads])

  const visible = useMemo(() => (
    filter === 'all' ? threads
      : filter === 'general' ? threads.filter(t => !t.category || t.category === 'general' || t.category === 'other')
      : threads.filter(t => t.category === filter)
  ), [threads, filter])

  const loadAnalysis = useCallback(async (caseId: string) => {
    if (caseId in analyses) return
    try {
      const res = await fetch(`/api/nexus/cases/${caseId}`, { cache: 'no-store' })
      const d = await res.json()
      setAnalyses(prev => ({ ...prev, [caseId]: res.ok ? (d.analysis ?? null) : null }))
    } catch { setAnalyses(prev => ({ ...prev, [caseId]: null })) }
  }, [analyses])

  useEffect(() => { for (const c of cases.slice(0, 3)) void loadAnalysis(c.id) }, [cases, loadAnalysis])

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function generate() {
    if (selected.size === 0) return
    setCreating(true); setError(null)
    try {
      const ids = Array.from(selected)
      const name = caseName.trim() || defaultCaseName(threads, ids, company.name)
      const res = await fetch(`/api/companies/${company.id}/cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, threadIds: ids }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not create the case.')
      setSelected(new Set()); setCaseName('')
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

      <SectionCard title="Cases" description="Groups of threads analysed together — a claim, a dispute, a multi-insurer renewal.">
        {cases.length === 0 && <Empty compact>No cases yet. Pick the threads below that belong to one matter and generate.</Empty>}
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

      <SectionCard
        title="Combine threads into a case"
        description="Tick the threads that belong to one matter, then generate. The agent reads them together and produces the case analysis."
        actions={
          selected.size > 0
            ? <Btn size="xs" level="primary" onClick={generate} loading={creating}><Network size={12} /> Generate from {selected.size} thread{selected.size === 1 ? '' : 's'}</Btn>
            : undefined
        }
      >
        {error && <p className="text-[12px] text-destructive m-0 mb-2">{error}</p>}

        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: counts.all }, { value: 'rfq', label: 'RFQ', count: counts.rfq },
            { value: 'claim', label: 'Claims', count: counts.claim }, { value: 'renewal', label: 'Renewals', count: counts.renewal },
            { value: 'general', label: 'General', count: counts.general },
          ]} />
          {selected.size > 0 && (
            <input value={caseName} onChange={e => setCaseName(e.target.value)} placeholder="Case name (optional)" className={`${inputCls} sm:max-w-[260px] sm:ml-auto`} />
          )}
        </div>

        {visible.length === 0 && <Empty compact>{threads.length === 0 ? 'No threads filed under this company yet.' : 'Nothing matches this filter.'}</Empty>}

        <ul className="m-0 p-0 list-none flex flex-col">
          {visible.map(t => (
            <li key={t.id} className={cn('border-b border-[--border-subtle] last:border-b-0', selected.has(t.id) && 'bg-[--selected-row-bg]')}>
              <label className="flex items-start gap-2.5 py-2 cursor-pointer">
                <input type="checkbox" className="mt-1 flex-shrink-0" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">{t.subject ?? '(no subject)'}</span>
                  {t.summary && <span className="block text-[11.5px] text-muted-foreground line-clamp-1 mt-0.5">{t.summary}</span>}
                  <span className="block text-[11px] text-muted-foreground/80 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {t.category && <Chip tone={CAT_TONE[t.category] ?? 'neutral'} className="capitalize">{t.category}</Chip>}
                    {t.caseIds.length > 0 && <Chip tone="blue">already in a case</Chip>}
                    {t.contact?.name ?? t.contact?.email ?? 'Unknown'} · {t.message_count} message{t.message_count === 1 ? '' : 's'} · {fmtRelative(t.last_message_at)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </SectionCard>

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
