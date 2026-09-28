'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { Btn, Chip } from '@/components/crm/primitives'
import { StatCard } from '@/components/stat-card'
import { Tip } from '@/components/Tip'

interface EvalRow {
  id: string; email_type: string | null; score: number
  eval_json: { what_human_changed: string; why_better: string; key_learning: string; context_summary: string } | null
  created_at: string
}
interface ExampleRow {
  id: string; email_type: string; context_summary: string; ideal_reply: string; score: number; created_at: string
}
interface Stat { email_type: string; count: number; avg_score: number }
interface ChatLearningRow {
  id: string; case_id: string; case_name: string | null; email_type: string | null
  question: string; answer: string; created_at: string
}
interface OverrideRow {
  id: string; email_type: string; override_text: string; synthesized_at: string; source_eval_count: number
  status?: SkillStatus
}
type SkillStatus = 'active' | 'superseded' | 'pinned' | 'deprecated'
interface TimelineVersion {
  id: string; email_type: string; override_text: string; source_eval_count: number | null
  status: SkillStatus; synthesized_at: string
}
interface SkillRecommendation {
  surface: string; action: 'pin' | 'deprecate' | 'none'; reason: string; sampleSize: number; avgScore: number
}

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'

// Status is a word on the same neutral chip — never a colour.
const STATUS_LABEL: Record<SkillStatus, string> = {
  active:     'Live in prompt',
  pinned:     'Pinned',
  superseded: 'Superseded',
  deprecated: 'Deprecated',
}
function StatusPill({ status }: { status?: SkillStatus }) {
  return <Chip>{STATUS_LABEL[status ?? 'active']}</Chip>
}

// Every eval surface — legacy Engagement reply types PLUS the RFQ and Nexus
// surfaces added later — mapped to a product area and label. The eval loop
// already writes/learns across all of these; this just renders them.
type SurfaceMeta = { label: string; area: string }
const SURFACE_META: Record<string, SurfaceMeta> = {
  // Engagement replies
  PRICING:         { label: 'Pricing',        area: 'Engagement' },
  COVERAGE:        { label: 'Coverage',       area: 'Engagement' },
  RENEWAL:         { label: 'Renewal',        area: 'Engagement' },
  DOCUMENT:        { label: 'Document',       area: 'Engagement' },
  CLAIMS:          { label: 'Claims',         area: 'Engagement' },
  CONVERSATION:    { label: 'Conversation',   area: 'Engagement' },
  // RFQ
  RFQ_INSURER:     { label: 'RFQ → Insurer',  area: 'RFQ' },
  RFQ_CHASE:       { label: 'RFQ chase',      area: 'RFQ' },
  // Nexus
  NEXUS:           { label: 'Nexus draft',    area: 'Nexus' },
  CHAT_CONSULTANT: { label: 'Ask-Opus chat',  area: 'Nexus' },
}
const AREA_ORDER = ['Engagement', 'RFQ', 'Nexus', 'Other']
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
function surfaceMeta(type: string | null): SurfaceMeta {
  const t = type ?? ''
  if (SURFACE_META[t]) return SURFACE_META[t]
  // Dynamic finer surfaces: NEXUS_<PARTY> (per recipient), RFQ_<X>.
  if (t.startsWith('NEXUS_')) return { label: `Nexus → ${titleCase(t.slice(6))}`, area: 'Nexus' }
  if (t.startsWith('RFQ_'))   return { label: `RFQ → ${titleCase(t.slice(4))}`,   area: 'RFQ' }
  return { label: titleCase(t.replace(/_/g, ' ')) || 'Unknown', area: 'Other' }
}

// One consistent sort for every multi-surface list on this page: by product area in
// AREA_ORDER, then alphabetically by surface label within an area — so "Engagement"
// items always group together, then "RFQ", then "Nexus", regardless of which tab or
// section is rendering them.
const areaRank = (area: string) => { const i = AREA_ORDER.indexOf(area); return i === -1 ? AREA_ORDER.length : i }
function compareSurfaces(a: string | null, b: string | null): number {
  const ma = surfaceMeta(a), mb = surfaceMeta(b)
  const diff = areaRank(ma.area) - areaRank(mb.area)
  return diff !== 0 ? diff : ma.label.localeCompare(mb.label)
}

/** Score as a plain tabular number. No stars, no colour. */
function Score({ score }: { score: number }) {
  return <span className="text-[14px] tabular-nums whitespace-nowrap" style={{ color: INK }}>{score}/5</span>
}
function TypePill({ type }: { type: string | null }) {
  return <Chip>{surfaceMeta(type).label}</Chip>
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
const fmtDayTime = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function SectionHeading({ title, tip, actions }: { title: string; tip?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight inline-flex items-center" style={{ color: INK }}>
        {title}{tip && <Tip text={tip} />}
      </h2>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  )
}

/** The identity cell of a register row: a surface chip, then the one-line summary. */
function IdentityLine({ chip, text }: { chip: React.ReactNode; text: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span className="flex-shrink-0">{chip}</span>
      <span className="text-[15px] font-medium leading-tight line-clamp-1 min-w-0" style={{ color: INK }}>{text}</span>
    </span>
  )
}

/** The detail row under an opened register row. */
function DetailRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr style={{ borderBottom: `1px solid ${RULE}` }}>
      <td colSpan={colSpan} className="px-6 pt-3">{children}</td>
    </tr>
  )
}

function Facts({ rows, labelWidth = 96 }: { rows: { label: string; val: string | null | undefined }[]; labelWidth?: number }) {
  return (
    <dl className="m-0 pb-4 flex flex-col gap-2">
      {rows.filter(r => r.val).map(r => (
        <div key={r.label} className="flex gap-3 flex-wrap sm:flex-nowrap">
          <dt className="m-0 text-[12.5px] flex-shrink-0 pt-px" style={{ color: MUTED, width: labelWidth }}>{r.label}</dt>
          <dd className="m-0 text-[14px] leading-relaxed min-w-0" style={{ color: INK }}>{r.val}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A collapsible explanation row: one line with a chevron, the text underneath when open. */
function HowRow({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 border-t border-b" style={{ borderColor: RULE }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full flex items-center gap-2 py-3 bg-transparent border-0 text-left cursor-pointer hover:bg-[#f8f9fa]">
        <span className="flex-1 text-[14px]" style={{ color: INK }}>{title}</span>
        <ChevronDown size={14} strokeWidth={2} className={cn('flex-shrink-0 transition-transform duration-200', open && 'rotate-180')} style={{ color: '#9aa0a6' }} />
      </button>
      {open && <p className="m-0 pb-4 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>{children}</p>}
    </div>
  )
}

export default function EvalPage() {
  const [evals,    setEvals]    = useState<EvalRow[]>([])
  const [examples, setExamples] = useState<ExampleRow[]>([])
  const [stats,    setStats]    = useState<Stat[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [debugging,  setDebugging]  = useState(false)
  const [debugTrace, setDebugTrace] = useState<string[] | null>(null)
  const [debugError, setDebugError] = useState<string | null>(null)
  const [overrides,    setOverrides]    = useState<OverrideRow[]>([])
  const [synthesising, setSynthesising] = useState(false)
  const [synthResult,  setSynthResult]  = useState<string | null>(null)
  const [synthError,   setSynthError]   = useState<string | null>(null)
  const [timeline,        setTimeline]        = useState<TimelineVersion[]>([])
  const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([])
  const [historyOpenFor,  setHistoryOpenFor]  = useState<string | null>(null)
  const [actionPending,   setActionPending]   = useState<string | null>(null)
  const [actionError,     setActionError]     = useState<string | null>(null)
  const [chatLearnings,      setChatLearnings]      = useState<ChatLearningRow[]>([])
  const [chatLearningsTotal, setChatLearningsTotal] = useState(0)

  async function loadChatLearnings() {
    fetch('/api/engagement/chat-learnings?limit=50', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then((d: { learnings?: ChatLearningRow[]; total?: number }) => {
        setChatLearnings(Array.isArray(d.learnings) ? d.learnings : [])
        setChatLearningsTotal(d.total ?? 0)
      })
      .catch(() => {})
  }

  async function loadOverrides() {
    fetch('/api/engagement/improve-prompt', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: OverrideRow[]) => setOverrides(Array.isArray(d) ? d : []))
      .catch(() => {})
  }

  async function loadTimeline() {
    fetch('/api/engagement/skill-timeline', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then((d: { versions?: TimelineVersion[]; recommendations?: SkillRecommendation[] }) => {
        setTimeline(Array.isArray(d.versions) ? d.versions : [])
        setRecommendations(Array.isArray(d.recommendations) ? d.recommendations : [])
      })
      .catch(() => {})
  }

  async function applySkillAction(action: 'pin' | 'unpin' | 'deprecate', id: string, emailType: string) {
    setActionPending(id); setActionError(null)
    try {
      const res = await fetch('/api/engagement/skill-timeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, email_type: emailType }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Action failed')
      await Promise.all([loadOverrides(), loadTimeline()])
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally { setActionPending(null) }
  }

  async function runSynthesis() {
    setSynthesising(true); setSynthResult(null); setSynthError(null)
    try {
      const res  = await fetch('/api/engagement/improve-prompt', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setSynthError(data.error ?? 'Synthesis failed')
      } else {
        setSynthResult(`Synthesised rules for ${data.synthesised} email type${data.synthesised !== 1 ? 's' : ''}. Now live in the prompt.`)
        await Promise.all([loadOverrides(), loadTimeline()])
      }
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : 'Request failed')
    } finally { setSynthesising(false) }
  }

  async function runDebug() {
    setDebugging(true); setDebugTrace(null); setDebugError(null)
    try {
      const res  = await fetch('/api/engagement/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      setDebugTrace(data.trace ?? [])
      if (!data.ok) setDebugError(data.error ?? 'Unknown error')
      else {
        // Reload eval data to show new result
        fetch('/api/engagement/evaluate?limit=100', { cache: 'no-store' })
          .then(r => r.ok ? r.json() : {})
          .then((d: { evaluations?: EvalRow[]; examples?: ExampleRow[]; stats?: Stat[] }) => {
            setEvals(Array.isArray(d.evaluations) ? d.evaluations : [])
            setExamples(Array.isArray(d.examples) ? d.examples : [])
            setStats(Array.isArray(d.stats) ? d.stats : [])
          }).catch(() => {})
      }
    } catch (e) {
      setDebugError(e instanceof Error ? e.message : 'Request failed')
    } finally { setDebugging(false) }
  }

  useEffect(() => {
    fetch('/api/engagement/evaluate?limit=100', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then((d: { evaluations?: EvalRow[]; examples?: ExampleRow[]; stats?: Stat[] }) => {
        setEvals(Array.isArray(d.evaluations) ? d.evaluations : [])
        setExamples(Array.isArray(d.examples) ? d.examples : [])
        setStats(Array.isArray(d.stats) ? d.stats : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    loadOverrides()
    loadTimeline()
    loadChatLearnings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const avgAll = evals.length
    ? Math.round((evals.reduce((s, e) => s + (e.score ?? 0), 0) / evals.length) * 10) / 10
    : null

  const learnings = evals.map(e => e.eval_json?.key_learning).filter((l): l is string => !!l && l.length > 10)
  const learningsByType: Record<string, { text: string; score: number }[]> = {}
  evals.forEach(e => {
    const t = e.email_type ?? 'UNKNOWN'
    const l = e.eval_json?.key_learning
    if (!l) return
    if (!learningsByType[t]) learningsByType[t] = []
    if (!learningsByType[t].find(x => x.text === l)) learningsByType[t].push({ text: l, score: e.score })
  })

  const examplesByType: Record<string, ExampleRow[]> = {}
  examples.forEach(ex => {
    const t = ex.email_type ?? 'UNKNOWN'
    if (!examplesByType[t]) examplesByType[t] = []
    examplesByType[t].push(ex)
  })

  // Chat learnings grouped by case, cases ordered by their most recent learning — the
  // "which case has fresh chat context" scan, mirroring how the other tabs group by the
  // dimension a reader would actually ask about.
  const chatLearningsByCase = new Map<string, { caseName: string; items: ChatLearningRow[] }>()
  chatLearnings.forEach(c => {
    if (!chatLearningsByCase.has(c.case_id)) chatLearningsByCase.set(c.case_id, { caseName: c.case_name ?? 'Unknown case', items: [] })
    chatLearningsByCase.get(c.case_id)!.items.push(c)
  })
  const chatLearningGroups = Array.from(chatLearningsByCase.values())
    .sort((a, b) => (b.items[0]?.created_at ?? '').localeCompare(a.items[0]?.created_at ?? ''))

  const rowBorder = { borderColor: RULE }
  const cellPad = 'pl-6'

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Email evaluation</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${evals.length} evaluation${evals.length === 1 ? '' : 's'} · average ${avgAll !== null ? `${avgAll}/5` : '—'} · last 100 sent emails across Engagement, RFQ and Nexus`}
            </p>
          </div>
          <Btn level="secondary" onClick={runDebug} loading={debugging}>
            {debugging ? 'Running…' : 'Evaluate last sent email'}
          </Btn>
        </div>

        {/* Debug trace */}
        {debugTrace && (
          <div className="mb-8">
            <pre className="m-0 px-4 py-3 rounded-[16px] text-[12px] leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto" style={{ background: FIELD, color: INK, fontFamily: 'ui-monospace, monospace' }}>
              {debugTrace.join('\n')}
            </pre>
            <p className="m-0 mt-2 text-[14px]" style={{ color: debugError ? INK : MUTED }}>
              {debugError ? `Error: ${debugError}` : 'Evaluation complete. Refresh to see the result.'}
            </p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[96px] rounded-[16px] animate-pulse" style={{ background: FIELD }} />)}
          </div>
        ) : (
          <>
            {/* Summary stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
              <StatCard label="Evaluated"       value={evals.length} />
              <StatCard label="Average score"   value={avgAll !== null ? `${avgAll}/5` : '—'} />
              <StatCard label="Examples stored" value={examples.length} />
              <StatCard label="Learnings"       value={learnings.length} />
              <StatCard label="Chat learnings"  value={chatLearningsTotal} />
            </div>

            {/* Per-surface breakdown, grouped by product area */}
            {stats.length > 0 && (
              <section className="mb-10">
                <SectionHeading title="Score by surface" />
                <div className="flex flex-col gap-5">
                  {AREA_ORDER.map(area => {
                    const inArea = stats
                      .filter(s => surfaceMeta(s.email_type).area === area)
                      .sort((a, b) => compareSurfaces(a.email_type, b.email_type))
                    if (inArea.length === 0) return null
                    return (
                      <div key={area}>
                        <p className="m-0 mb-2 text-[12.5px]" style={{ color: MUTED }}>{area}</p>
                        <div className="flex flex-wrap gap-3">
                          {inArea.map(s => (
                            <div key={s.email_type} className="rounded-[16px] px-4 py-3 min-w-[140px]" style={{ background: FIELD }}>
                              <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{surfaceMeta(s.email_type).label}</p>
                              <p className="m-0 mt-1.5 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>
                                {s.avg_score}<span className="text-[13px] font-normal ml-0.5" style={{ color: MUTED }}>/5</span>
                              </p>
                              <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: MUTED }}>{s.count} eval{s.count !== 1 ? 's' : ''}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Tabs */}
            <Tabs defaultValue="evals">
              <TabsList className="mb-2 h-auto flex-wrap justify-start">
                <TabsTrigger value="evals">Evaluations <span className="ml-1 text-[11.5px] tabular-nums" style={{ color: MUTED }}>{evals.length}</span></TabsTrigger>
                <TabsTrigger value="learnings">Prompt learnings <span className="ml-1 text-[11.5px] tabular-nums" style={{ color: MUTED }}>{learnings.length}</span></TabsTrigger>
                <TabsTrigger value="examples">Few-shot examples <span className="ml-1 text-[11.5px] tabular-nums" style={{ color: MUTED }}>{examples.length}</span></TabsTrigger>
                <TabsTrigger value="chat-learnings">Chat learnings <span className="ml-1 text-[11.5px] tabular-nums" style={{ color: MUTED }}>{chatLearningsTotal}</span></TabsTrigger>
              </TabsList>

              {/* Evaluations tab */}
              <TabsContent value="evals">
                {evals.length === 0 ? (
                  <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No evaluations yet. They appear after every sent email.</p>
                ) : (
                  <Register label="Evaluations" minWidth={560}>
                    <RegisterHead>
                      <RegisterTh className={cellPad}>Evaluation</RegisterTh>
                      <RegisterTh align="right">Score</RegisterTh>
                      <RegisterTh last align="right">Date</RegisterTh>
                    </RegisterHead>
                    <tbody>
                      {evals.map(e => {
                        const open = expanded === e.id
                        return (
                          <Fragment key={e.id}>
                            <RegisterRow selected={open} onClick={() => setExpanded(open ? null : e.id)}>
                              <RegisterCell nowrap={false} className={cellPad}>
                                <IdentityLine chip={<TypePill type={e.email_type} />} text={e.eval_json?.what_human_changed ?? '—'} />
                              </RegisterCell>
                              <RegisterCell align="right"><Score score={e.score} /></RegisterCell>
                              <RegisterCell last align="right" primary={fmtDay(e.created_at)} />
                            </RegisterRow>
                            {open && e.eval_json && (
                              <DetailRow colSpan={3}>
                                <Facts rows={[
                                  { label: 'What changed', val: e.eval_json.what_human_changed },
                                  { label: 'Why better',   val: e.eval_json.why_better },
                                  { label: 'Key learning', val: e.eval_json.key_learning },
                                  { label: 'Context',      val: e.eval_json.context_summary },
                                ]} />
                              </DetailRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </Register>
                )}
              </TabsContent>

              {/* Learnings tab */}
              <TabsContent value="learnings">
                {Object.keys(learningsByType).length === 0 ? (
                  <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No learnings yet.</p>
                ) : (
                  <Register label="Prompt learnings" minWidth={560}>
                    <RegisterHead>
                      <RegisterTh className={cellPad}>Rule</RegisterTh>
                      <RegisterTh>Status</RegisterTh>
                      <RegisterTh last />
                    </RegisterHead>
                    <tbody>
                      {Object.entries(learningsByType).sort(([a], [b]) => compareSurfaces(a, b)).map(([type, rules]) => {
                        const injectedCount = rules.filter(r => r.score <= 3).length
                        return (
                          <Fragment key={type}>
                            <RegisterGroupRow colSpan={3}>
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                <TypePill type={type} />
                                <span className="font-normal" style={{ color: MUTED }}>{rules.length} rule{rules.length !== 1 ? 's' : ''} learned{injectedCount > 0 ? ` · ${injectedCount} live in prompt` : ''}</span>
                              </span>
                            </RegisterGroupRow>
                            {rules.map((r, i) => (
                              <RegisterRow key={i} className="hover:bg-[#f8f9fa]">
                                <RegisterCell nowrap={false} className={cellPad}>
                                  <span className="block text-[14px] leading-relaxed min-w-[280px]" style={{ color: INK }}>{r.text}</span>
                                </RegisterCell>
                                <RegisterCell>
                                  {r.score <= 3 ? <Chip title="Injected into the AI prompt as an avoid pattern">Live in prompt</Chip> : <span className="text-[13px]" style={{ color: MUTED }}>Feeds examples</span>}
                                </RegisterCell>
                                <RegisterCell last align="right">
                                  <Btn level="secondary" size="xs" onClick={() => navigator.clipboard.writeText(r.text)} title="Copy to clipboard">Copy</Btn>
                                </RegisterCell>
                              </RegisterRow>
                            ))}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </Register>
                )}
                <HowRow title="How learnings work">
                  Rules from drafts scored 1 to 3 are marked live in prompt: they are injected as avoid patterns into every new draft of that email type, with no manual step. Rules from drafts scored 4 or 5 feed the few-shot examples. Both loops run on every send.
                </HowRow>
              </TabsContent>

              {/* Examples tab — grouped by surface, same "what's this surface's best output
                  look like" scan as Prompt learnings, so a surface's whole story (learnings +
                  examples) reads the same way across tabs. */}
              <TabsContent value="examples">
                {Object.keys(examplesByType).length === 0 ? (
                  <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No examples yet. A reply is stored when it scores 4 or 5.</p>
                ) : (
                  <Register label="Few-shot examples" minWidth={560}>
                    <RegisterHead>
                      <RegisterTh className={cellPad}>Example</RegisterTh>
                      <RegisterTh align="right">Score</RegisterTh>
                      <RegisterTh last align="right">Date</RegisterTh>
                    </RegisterHead>
                    <tbody>
                      {Object.entries(examplesByType).sort(([a], [b]) => compareSurfaces(a, b)).map(([type, rows]) => (
                        <Fragment key={type}>
                          <RegisterGroupRow colSpan={3}>
                            <span className="inline-flex items-center gap-2 flex-wrap">
                              <TypePill type={type} />
                              <span className="font-normal" style={{ color: MUTED }}>{rows.length} example{rows.length !== 1 ? 's' : ''}</span>
                            </span>
                          </RegisterGroupRow>
                          {rows.map(ex => {
                            const open = expanded === ex.id
                            return (
                              <Fragment key={ex.id}>
                                <RegisterRow selected={open} onClick={() => setExpanded(open ? null : ex.id)}>
                                  <RegisterCell nowrap={false} className={cellPad}>
                                    <span className="block text-[15px] font-medium leading-tight line-clamp-1" style={{ color: INK }}>{ex.context_summary || 'No summary'}</span>
                                  </RegisterCell>
                                  <RegisterCell align="right"><Score score={ex.score} /></RegisterCell>
                                  <RegisterCell last align="right" primary={fmtDay(ex.created_at)} />
                                </RegisterRow>
                                {open && (
                                  <DetailRow colSpan={3}>
                                    <div className="pb-4">
                                      {ex.context_summary && (
                                        <p className="m-0 mb-2 text-[12.5px]" style={{ color: MUTED }}>{ex.context_summary}</p>
                                      )}
                                      <pre className="m-0 px-4 py-3 rounded-[16px] text-[14px] whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto" style={{ background: FIELD, color: INK, fontFamily: 'inherit' }}>
                                        {ex.ideal_reply}
                                      </pre>
                                    </div>
                                  </DetailRow>
                                )}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </Register>
                )}
              </TabsContent>

              {/* Chat learnings tab — facts extracted nightly from Nexus Ask-Opus chat
                  conversations (src/app/api/cron/nexus-chat-learnings). Case-tagged rows also
                  feed that same case's next Grand Analysis; email_type-tagged rows are pooled
                  across all cases into Engagement's Skill evolution synthesis below. */}
              <TabsContent value="chat-learnings">
                {chatLearningGroups.length === 0 ? (
                  <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No chat learnings yet. They are extracted nightly from case Ask-Opus conversations.</p>
                ) : (
                  <Register label="Chat learnings" minWidth={560}>
                    <RegisterHead>
                      <RegisterTh className={cellPad}>Question</RegisterTh>
                      <RegisterTh last align="right">Date</RegisterTh>
                    </RegisterHead>
                    <tbody>
                      {chatLearningGroups.map(group => (
                        <Fragment key={group.items[0]?.case_id ?? group.caseName}>
                          <RegisterGroupRow colSpan={2}>
                            {group.caseName} <span className="font-normal tabular-nums" style={{ color: MUTED }}>{group.items.length}</span>
                          </RegisterGroupRow>
                          {group.items.map(c => {
                            const open = expanded === c.id
                            return (
                              <Fragment key={c.id}>
                                <RegisterRow selected={open} onClick={() => setExpanded(open ? null : c.id)}>
                                  <RegisterCell nowrap={false} className={cellPad}>
                                    <IdentityLine chip={c.email_type ? <TypePill type={c.email_type} /> : <Chip>General</Chip>} text={c.question} />
                                  </RegisterCell>
                                  <RegisterCell last align="right" primary={fmtDay(c.created_at)} />
                                </RegisterRow>
                                {open && (
                                  <DetailRow colSpan={2}>
                                    <Facts labelWidth={64} rows={[
                                      { label: 'Asked',  val: c.question },
                                      { label: 'Answer', val: c.answer },
                                    ]} />
                                  </DetailRow>
                                )}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </Register>
                )}
                <HowRow title="How chat learnings work">
                  Every night, new Ask-Opus conversations linked to a case are reviewed for substantive questions. Each one is tagged with its case and, where relevant, a surface type. Case-tagged facts are read the next time that case&apos;s Grand Analysis runs, so the broker is not asked to repeat context. Surface-tagged facts are pooled across every case and feed Engagement&apos;s Skill evolution below, the same as evaluation-derived learnings. Nothing here triggers a re-analysis automatically.
                </HowRow>
              </TabsContent>
            </Tabs>

            {/* ── Skill evolution ──────────────────────────────────────────────── */}
            <section className="mt-12 pt-8 border-t" style={rowBorder}>
              <SectionHeading
                title="Skill evolution"
                tip="Reads all evaluations, synthesises them into refined rules via AI, and writes them live into the agent prompt. Each surface keeps a full version history: pin a version to lock it in, or deprecate one that is underperforming."
                actions={
                  <Btn level="primary" onClick={runSynthesis} disabled={synthesising || evals.length === 0} loading={synthesising}>
                    {synthesising ? 'Synthesising…' : 'Synthesise prompt improvements'}
                  </Btn>
                }
              />

              {synthResult && <p className="m-0 mb-4 text-[14px]" style={{ color: '#3c4043' }}>{synthResult}</p>}
              {synthError  && <p className="m-0 mb-4 text-[14px]" style={{ color: INK }}>Error: {synthError}</p>}
              {actionError && <p className="m-0 mb-4 text-[14px]" style={{ color: INK }}>Error: {actionError}</p>}

              {/* Recommendations — heuristic, based on eval volume/score since each surface's
                  current version went live. Numbers are shown so a human can override the call. */}
              {recommendations.some(r => r.action !== 'none') && (
                <Register label="Recommendations" minWidth={560} className="mb-6">
                  <RegisterHead>
                    <RegisterTh className={cellPad}>Recommendation</RegisterTh>
                    <RegisterTh align="right">Score</RegisterTh>
                    <RegisterTh last />
                  </RegisterHead>
                  <tbody>
                    {recommendations.filter(r => r.action !== 'none').sort((a, b) => compareSurfaces(a.surface, b.surface)).map(r => {
                      const version = timeline.find(v => v.email_type === r.surface && (v.status === 'active' || v.status === 'pinned'))
                      return (
                        <RegisterRow key={r.surface} className="hover:bg-[#f8f9fa]">
                          <RegisterCell nowrap={false} className={cellPad}>
                            <IdentityLine chip={<TypePill type={r.surface} />} text={r.action === 'pin' ? 'Promote this version' : 'Consider deprecating'} />
                            <span className="block text-[12.5px] mt-0.5 pl-0" style={{ color: MUTED }}>{r.reason}</span>
                          </RegisterCell>
                          <RegisterCell align="right" primary={`${r.avgScore}/5`} secondary={`${r.sampleSize} eval${r.sampleSize === 1 ? '' : 's'}`} />
                          <RegisterCell last align="right">
                            {version && (
                              <Btn
                                level="secondary" size="xs"
                                onClick={() => applySkillAction(r.action === 'pin' ? 'pin' : 'deprecate', version.id, r.surface)}
                                disabled={actionPending === version.id}
                              >
                                {actionPending === version.id ? '…' : r.action === 'pin' ? 'Pin this version' : 'Deprecate'}
                              </Btn>
                            )}
                          </RegisterCell>
                        </RegisterRow>
                      )
                    })}
                  </tbody>
                </Register>
              )}

              {overrides.length === 0 ? (
                <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>
                  No synthesised rules yet. Once several evaluations exist, synthesise prompt improvements to generate a ruleset.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {overrides.slice().sort((a, b) => compareSurfaces(a.email_type, b.email_type)).map(o => {
                    const history = timeline.filter(v => v.email_type === o.email_type && v.id !== o.id)
                    const isPinned = o.status === 'pinned'
                    return (
                      <div key={o.id} className="rounded-[16px] border p-5" style={{ borderColor: RULE, background: '#fff' }}>
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <TypePill type={o.email_type} />
                          <StatusPill status={o.status} />
                          <span className="text-[12.5px]" style={{ color: MUTED }}>{o.source_eval_count} eval{o.source_eval_count !== 1 ? 's' : ''} used</span>
                          <span className="ml-auto text-[12.5px] tabular-nums" style={{ color: MUTED }}>{fmtDayTime(o.synthesized_at)}</span>
                        </div>
                        <pre className="m-0 text-[14px] whitespace-pre-wrap leading-relaxed" style={{ color: INK, fontFamily: 'inherit' }}>
                          {o.override_text}
                        </pre>
                        <div className="flex items-center gap-2 mt-4 flex-wrap">
                          {isPinned ? (
                            <Btn level="secondary" size="xs" onClick={() => applySkillAction('unpin', o.id, o.email_type)} disabled={actionPending === o.id}>
                              {actionPending === o.id ? '…' : 'Unpin'}
                            </Btn>
                          ) : (
                            <Btn level="secondary" size="xs" onClick={() => applySkillAction('pin', o.id, o.email_type)} disabled={actionPending === o.id}>
                              {actionPending === o.id ? '…' : 'Pin'}
                            </Btn>
                          )}
                          <Btn level="secondary" size="xs" className="text-[#c5221f]" onClick={() => applySkillAction('deprecate', o.id, o.email_type)} disabled={actionPending === o.id}>
                            {actionPending === o.id ? '…' : 'Deprecate'}
                          </Btn>
                          {history.length > 0 && (
                            <Btn level="tertiary" size="xs" className="ml-auto" onClick={() => setHistoryOpenFor(historyOpenFor === o.email_type ? null : o.email_type)}>
                              {historyOpenFor === o.email_type ? 'Hide' : 'Show'} history ({history.length})
                            </Btn>
                          )}
                        </div>
                        {historyOpenFor === o.email_type && history.length > 0 && (
                          <div className="mt-4 pt-3 border-t flex flex-col" style={rowBorder}>
                            {history.map(v => (
                              <div key={v.id} className="flex items-start gap-2.5 py-2 text-[12.5px] border-b last:border-b-0" style={rowBorder}>
                                <StatusPill status={v.status} />
                                <span className="flex-shrink-0 whitespace-nowrap tabular-nums" style={{ color: MUTED }}>{fmtDayTime(v.synthesized_at)}</span>
                                <span className="truncate flex-1 min-w-0" style={{ color: MUTED }}>{v.override_text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
