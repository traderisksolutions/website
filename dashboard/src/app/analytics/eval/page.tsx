'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

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

const STATUS_META: Record<SkillStatus, { label: string; className: string }> = {
  active:     { label: '✦ live in prompt', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  pinned:     { label: '📌 pinned',         className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  superseded: { label: 'superseded',        className: 'bg-muted text-muted-foreground' },
  deprecated: { label: 'deprecated',        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}
function StatusPill({ status }: { status?: SkillStatus }) {
  const m = STATUS_META[status ?? 'active']
  return <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap', m.className)}>{m.label}</span>
}

// Every eval surface — legacy Engagement reply types PLUS the RFQ and Nexus
// surfaces added later — mapped to a product area, label and colour. The eval
// loop already writes/learns across all of these; this just renders them.
type SurfaceMeta = { label: string; area: string; color: string }
const SURFACE_META: Record<string, SurfaceMeta> = {
  // Engagement replies
  PRICING:         { label: 'Pricing',        area: 'Engagement', color: '#2563eb' },
  COVERAGE:        { label: 'Coverage',       area: 'Engagement', color: '#7c3aed' },
  RENEWAL:         { label: 'Renewal',        area: 'Engagement', color: '#d97706' },
  DOCUMENT:        { label: 'Document',       area: 'Engagement', color: '#0891b2' },
  CLAIMS:          { label: 'Claims',         area: 'Engagement', color: '#dc2626' },
  CONVERSATION:    { label: 'Conversation',   area: 'Engagement', color: '#059669' },
  // RFQ
  RFQ_INSURER:     { label: 'RFQ → Insurer',  area: 'RFQ',        color: '#6366f1' },
  RFQ_CHASE:       { label: 'RFQ chase',      area: 'RFQ',        color: '#818cf8' },
  // Nexus
  NEXUS:           { label: 'Nexus draft',    area: 'Nexus',      color: '#8b5cf6' },
  CHAT_CONSULTANT: { label: 'Ask-Opus chat',  area: 'Nexus',      color: '#a855f7' },
}
const AREA_ORDER = ['Engagement', 'RFQ', 'Nexus', 'Other']
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
function surfaceMeta(type: string | null): SurfaceMeta {
  const t = type ?? ''
  if (SURFACE_META[t]) return SURFACE_META[t]
  // Dynamic finer surfaces: NEXUS_<PARTY> (per recipient), RFQ_<X>.
  if (t.startsWith('NEXUS_')) return { label: `Nexus → ${titleCase(t.slice(6))}`, area: 'Nexus', color: '#8b5cf6' }
  if (t.startsWith('RFQ_'))   return { label: `RFQ → ${titleCase(t.slice(4))}`,   area: 'RFQ',   color: '#6366f1' }
  return { label: titleCase(t.replace(/_/g, ' ')) || 'Unknown', area: 'Other', color: '#6b7280' }
}

// One consistent sort for every multi-surface list on this page: by product area in
// AREA_ORDER, then alphabetically by surface label within an area — so "Engagement"
// items always group together, then "RFQ", then "Nexus", regardless of which tab or
// section is rendering them. Each surface already carries a fixed color (SURFACE_META),
// so grouping + that color together is what makes a list scannable at a glance.
const areaRank = (area: string) => { const i = AREA_ORDER.indexOf(area); return i === -1 ? AREA_ORDER.length : i }
function compareSurfaces(a: string | null, b: string | null): number {
  const ma = surfaceMeta(a), mb = surfaceMeta(b)
  const diff = areaRank(ma.area) - areaRank(mb.area)
  return diff !== 0 ? diff : ma.label.localeCompare(mb.label)
}

const SCORE_COLOR = (s: number) => s >= 4 ? '#16a34a' : s === 3 ? '#d97706' : '#dc2626'

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-[5px] whitespace-nowrap"
      style={{ background: SCORE_COLOR(score) + '18', color: SCORE_COLOR(score) }}
    >
      {'★'.repeat(score)}{'☆'.repeat(5 - score)} {score}/5
    </span>
  )
}
function TypePill({ type }: { type: string | null }) {
  const m = surfaceMeta(type)
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded tracking-wide whitespace-nowrap"
      style={{ background: m.color + '14', color: m.color }}
    >
      {m.label}
    </span>
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
        setSynthResult(`Synthesised rules for ${data.synthesised} email type${data.synthesised !== 1 ? 's' : ''} — now live in the prompt.`)
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground">AI Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How closely AI output matched what was actually sent — across Engagement replies, RFQ drafts and Nexus — and what each surface is learning
        </p>
      </div>

      {/* Debug panel */}
      <div className="mb-6 border border-dashed border-border rounded-xl p-4 bg-muted/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[12px] font-semibold text-foreground">Debug: Run evaluation on last sent email</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Finds the most recently sent AI draft and runs evaluation synchronously, showing each step.</p>
          </div>
          <button
            onClick={runDebug}
            disabled={debugging}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {debugging ? 'Running…' : 'Run Debug Eval'}
          </button>
        </div>
        {debugTrace && (
          <div className="mt-3 rounded-lg bg-zinc-950 p-3 max-h-64 overflow-y-auto">
            {debugTrace.map((line, i) => (
              <p key={i} className={cn(
                'text-[11px] font-mono leading-relaxed',
                line.includes('MISSING') || line.includes('error') || line.includes('EXCEPTION') || line.includes('failed')
                  ? 'text-red-400' : line.includes('ok=true') || line.includes('score=') ? 'text-emerald-400' : 'text-zinc-300'
              )}>{line}</p>
            ))}
            {debugError && <p className="text-[11px] font-mono text-red-400 mt-1 font-bold">✗ {debugError}</p>}
            {!debugError && <p className="text-[11px] font-mono text-emerald-400 mt-1 font-bold">✓ Evaluation complete — refresh to see result above</p>}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total Evaluated', value: evals.length,    color: 'text-foreground' },
              { label: 'Avg Score',       value: avgAll !== null ? `${avgAll}/5` : '—', color: avgAll ? `text-[${SCORE_COLOR(avgAll)}]` : '' },
              { label: 'Examples Stored', value: examples.length,  color: 'text-primary' },
              { label: 'Learnings',       value: learnings.length,  color: 'text-violet-600' },
              { label: 'Chat Learnings',  value: chatLearningsTotal, color: 'text-blue-600' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{s.label}</p>
                  <p className={cn('text-3xl font-bold tracking-tight', s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per-surface breakdown, grouped by product area */}
          {stats.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Score by surface</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-0">
                {AREA_ORDER.map(area => {
                  const inArea = stats
                    .filter(s => surfaceMeta(s.email_type).area === area)
                    .sort((a, b) => compareSurfaces(a.email_type, b.email_type))
                  if (inArea.length === 0) return null
                  return (
                    <div key={area} className="flex flex-col gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{area}</p>
                      <div className="flex flex-wrap gap-3">
                        {inArea.map(s => (
                          <div key={s.email_type} className="border border-[--border-subtle] rounded-lg px-4 py-3 min-w-[110px] bg-muted/30">
                            <TypePill type={s.email_type} />
                            <p className="mt-2 text-[20px] font-bold tracking-tight" style={{ color: SCORE_COLOR(s.avg_score) }}>
                              {s.avg_score}<span className="text-[11px] text-muted-foreground font-normal ml-0.5">/5</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.count} eval{s.count !== 1 ? 's' : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="evals">
            <TabsList className="mb-4">
              <TabsTrigger value="evals">Evaluations ({evals.length})</TabsTrigger>
              <TabsTrigger value="learnings">Prompt Learnings ({learnings.length})</TabsTrigger>
              <TabsTrigger value="examples">Few-Shot Examples ({examples.length})</TabsTrigger>
              <TabsTrigger value="chat-learnings">Chat Learnings ({chatLearningsTotal})</TabsTrigger>
            </TabsList>

            {/* Evaluations tab */}
            <TabsContent value="evals">
              <Card>
                {evals.length === 0 ? (
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground italic">No evaluations yet — they appear automatically after every sent email.</p>
                  </CardContent>
                ) : (
                  <CardContent className="p-0">
                    {evals.map((e, i) => (
                      <div key={e.id} className={cn(i < evals.length - 1 && 'border-b border-[--border-subtle]')}>
                        <button
                          onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        >
                          <TypePill type={e.email_type} />
                          <ScoreBadge score={e.score} />
                          <span className="flex-1 text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                            {e.eval_json?.what_human_changed ?? '—'}
                          </span>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {new Date(e.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                          </span>
                        </button>
                        {expanded === e.id && e.eval_json && (
                          <div className="px-4 pb-4 flex flex-col gap-2">
                            {[
                              { label: 'What changed',   val: e.eval_json.what_human_changed },
                              { label: 'Why better',     val: e.eval_json.why_better },
                              { label: '💡 Key learning', val: e.eval_json.key_learning },
                              { label: 'Context',        val: e.eval_json.context_summary },
                            ].filter(r => r.val).map(row => (
                              <div key={row.label} className="flex gap-2.5">
                                <span className="text-[11px] text-muted-foreground min-w-[96px] font-semibold pt-0.5">{row.label}</span>
                                <span className="text-[12px] text-foreground leading-relaxed">{row.val}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            {/* Learnings tab */}
            <TabsContent value="learnings">
              <div className="flex flex-col gap-4">
                {Object.keys(learningsByType).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No learnings yet.</p>
                ) : Object.entries(learningsByType).sort(([a], [b]) => compareSurfaces(a, b)).map(([type, rules]) => {
                  const injectedCount = rules.filter(r => r.score <= 3).length
                  return (
                    <Card key={type}>
                      <CardHeader className="pb-2 flex-row items-center gap-2 flex-wrap">
                        <TypePill type={type} />
                        <span className="text-[12px] text-muted-foreground">{rules.length} rule{rules.length !== 1 ? 's' : ''} learned</span>
                        {injectedCount > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            ⚡ {injectedCount} auto-injected into prompt
                          </span>
                        )}
                      </CardHeader>
                      <CardContent>
                        <ul className="flex flex-col gap-2.5 list-none pl-0">
                          {rules.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 group">
                              <span className="text-muted-foreground mt-0.5 text-[11px] flex-shrink-0 select-none">•</span>
                              <span className="text-[13px] text-foreground leading-relaxed flex-1">{r.text}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                {r.score <= 3 && (
                                  <span title="Automatically injected into the AI prompt as an AVOID pattern" className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                                    ⚡ live
                                  </span>
                                )}
                                <button
                                  onClick={() => navigator.clipboard.writeText(r.text)}
                                  className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/50 hover:border-border transition-colors"
                                  title="Copy to clipboard"
                                >
                                  copy
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )
                })}
                <div className="border border-dashed border-border rounded-xl p-5 bg-muted/30">
                  <p className="text-[12px] font-semibold text-foreground mb-1.5">How learnings work</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Rules from <strong className="text-foreground">score 1–3</strong> drafts are marked <span className="font-semibold text-amber-600">⚡ live</span> — automatically injected as AVOID patterns into every new draft of that email type, no manual action needed.{' '}
                    Rules from score 4–5 drafts feed the few-shot examples. Both loops run on every send.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Examples tab — grouped by surface, same "what's this surface's best output
                look like" scan as Prompt Learnings, so a surface's whole story (learnings +
                examples) reads the same way across tabs. */}
            <TabsContent value="examples">
              {Object.keys(examplesByType).length === 0 ? (
                <Card>
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground italic">No examples yet — stored automatically when a reply scores 4 or 5.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-4">
                  {Object.entries(examplesByType).sort(([a], [b]) => compareSurfaces(a, b)).map(([type, rows]) => (
                    <Card key={type}>
                      <CardHeader className="pb-2 flex-row items-center gap-2 flex-wrap">
                        <TypePill type={type} />
                        <span className="text-[12px] text-muted-foreground">{rows.length} example{rows.length !== 1 ? 's' : ''}</span>
                      </CardHeader>
                      <CardContent className="p-0">
                        {rows.map((ex, i) => (
                          <div key={ex.id} className={cn(i < rows.length - 1 && 'border-b border-[--border-subtle]')}>
                            <button
                              onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                            >
                              <ScoreBadge score={ex.score} />
                              <span className="flex-1 text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                                {ex.context_summary || '(no summary)'}
                              </span>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {new Date(ex.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                              </span>
                            </button>
                            {expanded === ex.id && (
                              <div className="px-4 pb-4">
                                {ex.context_summary && (
                                  <p className="text-[11px] text-muted-foreground mb-2">{ex.context_summary}</p>
                                )}
                                <pre className="text-[12px] text-foreground bg-muted/50 border border-[--border-subtle] rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-sans max-h-72 overflow-y-auto">
                                  {ex.ideal_reply}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Chat Learnings tab — facts extracted nightly from Nexus Ask-Opus chat
                conversations (src/app/api/cron/nexus-chat-learnings). Case-tagged rows also
                feed that same case's next Grand Analysis; email_type-tagged rows are pooled
                across all cases into Engagement's Skill Evolution synthesis below. */}
            <TabsContent value="chat-learnings">
              {chatLearningGroups.length === 0 ? (
                <Card>
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground italic">No chat learnings yet — extracted nightly from case Ask-Opus conversations that had substantive questions.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-4">
                  {chatLearningGroups.map(group => (
                    <Card key={group.items[0]?.case_id ?? group.caseName}>
                      <CardHeader className="pb-2 flex-row items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm">{group.caseName}</CardTitle>
                        <span className="text-[12px] text-muted-foreground">{group.items.length} learning{group.items.length !== 1 ? 's' : ''}</span>
                      </CardHeader>
                      <CardContent className="p-0">
                        {group.items.map((c, i) => (
                          <div key={c.id} className={cn(i < group.items.length - 1 && 'border-b border-[--border-subtle]')}>
                            <button
                              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                            >
                              {c.email_type ? <TypePill type={c.email_type} /> : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded tracking-wide whitespace-nowrap bg-muted/50 text-muted-foreground/70">General</span>
                              )}
                              <span className="flex-1 text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                                {c.question}
                              </span>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {new Date(c.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                              </span>
                            </button>
                            {expanded === c.id && (
                              <div className="px-4 pb-4 flex flex-col gap-2">
                                <div className="flex gap-2.5">
                                  <span className="text-[11px] text-muted-foreground min-w-[60px] font-semibold pt-0.5">Asked</span>
                                  <span className="text-[12px] text-foreground leading-relaxed">{c.question}</span>
                                </div>
                                <div className="flex gap-2.5">
                                  <span className="text-[11px] text-muted-foreground min-w-[60px] font-semibold pt-0.5">Answer</span>
                                  <span className="text-[12px] text-foreground leading-relaxed">{c.answer}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className="mt-4 border border-dashed border-border rounded-xl p-5 bg-muted/30">
                <p className="text-[12px] font-semibold text-foreground mb-1.5">How chat learnings work</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Every night, new Ask-Opus conversations linked to a case are reviewed for substantive questions. Each one is tagged with the case it belongs to and — where relevant — a surface type. <strong className="text-foreground">Case-tagged</strong> facts are read the next time that same case&apos;s Grand Analysis runs, so the broker isn&apos;t asked to repeat context already given. <strong className="text-foreground">Surface-tagged</strong> facts are pooled across every case and feed Engagement&apos;s Skill Evolution below, the same as evaluation-derived learnings. Nothing here triggers a re-analysis automatically.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* ── Skill Evolution (formerly "Auto-Prompt Improvement") ────────── */}
          <div className="mt-8 border-t border-[--border-subtle] pt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Skill Evolution</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Reads all evaluations, synthesises them into refined rules via AI, and writes them live into the agent prompt. Each surface keeps a full version history — pin a version to lock it in, or deprecate one that&apos;s underperforming.
                </p>
              </div>
              <button
                onClick={runSynthesis}
                disabled={synthesising || evals.length === 0}
                className="text-[12px] font-semibold px-4 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40 whitespace-nowrap flex items-center gap-2"
              >
                {synthesising ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Synthesising…
                  </>
                ) : '✦ Synthesise Prompt Improvements'}
              </button>
            </div>

            {synthResult && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700 font-medium">
                ✓ {synthResult}
              </div>
            )}
            {synthError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
                ✗ {synthError}
              </div>
            )}
            {actionError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
                ✗ {actionError}
              </div>
            )}

            {/* Recommendations — heuristic, based on eval volume/score since each surface's
                current version went live. Numbers are shown so a human can override the call. */}
            {recommendations.some(r => r.action !== 'none') && (
              <div className="mb-4 flex flex-col gap-2">
                {recommendations.filter(r => r.action !== 'none').sort((a, b) => compareSurfaces(a.surface, b.surface)).map(r => {
                  const version = timeline.find(v => v.email_type === r.surface && (v.status === 'active' || v.status === 'pinned'))
                  return (
                    <div key={r.surface} className={cn(
                      'flex items-center gap-3 flex-wrap p-3 rounded-lg border text-[12px]',
                      r.action === 'pin' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900'
                    )}>
                      <TypePill type={r.surface} />
                      <span className="text-foreground">
                        {r.action === 'pin' ? 'Promote' : 'Consider deprecating'} — <span className="text-muted-foreground">{r.reason}</span>
                      </span>
                      {version && (
                        <button
                          onClick={() => applySkillAction(r.action === 'pin' ? 'pin' : 'deprecate', version.id, r.surface)}
                          disabled={actionPending === version.id}
                          className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          {actionPending === version.id ? '…' : r.action === 'pin' ? '📌 Pin this version' : '🗑 Deprecate'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {overrides.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-5 bg-muted/20">
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  No synthesised rules yet. Once you have several evaluations, click <strong>Synthesise Prompt Improvements</strong> to generate a refined ruleset.
                  The agent will use these instead of raw learnings — more precise and consistent.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {overrides.slice().sort((a, b) => compareSurfaces(a.email_type, b.email_type)).map(o => {
                  const history = timeline.filter(v => v.email_type === o.email_type && v.id !== o.id)
                  const isPinned = o.status === 'pinned'
                  return (
                    <Card key={o.id}>
                      <CardHeader className="pb-2 flex-row items-center gap-2 flex-wrap">
                        <TypePill type={o.email_type} />
                        <span className="text-[11px] text-muted-foreground">{o.source_eval_count} eval{o.source_eval_count !== 1 ? 's' : ''} used</span>
                        <StatusPill status={o.status} />
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {new Date(o.synthesized_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed font-sans">
                          {o.override_text}
                        </pre>
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {isPinned ? (
                            <button
                              onClick={() => applySkillAction('unpin', o.id, o.email_type)}
                              disabled={actionPending === o.id}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40"
                            >
                              {actionPending === o.id ? '…' : 'Unpin'}
                            </button>
                          ) : (
                            <button
                              onClick={() => applySkillAction('pin', o.id, o.email_type)}
                              disabled={actionPending === o.id}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40"
                            >
                              {actionPending === o.id ? '…' : '📌 Pin'}
                            </button>
                          )}
                          <button
                            onClick={() => applySkillAction('deprecate', o.id, o.email_type)}
                            disabled={actionPending === o.id}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40"
                          >
                            {actionPending === o.id ? '…' : 'Deprecate'}
                          </button>
                          {history.length > 0 && (
                            <button
                              onClick={() => setHistoryOpenFor(historyOpenFor === o.email_type ? null : o.email_type)}
                              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground px-2 py-1"
                            >
                              {historyOpenFor === o.email_type ? 'Hide' : 'View'} history ({history.length})
                            </button>
                          )}
                        </div>
                        {historyOpenFor === o.email_type && history.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-[--border-subtle] flex flex-col gap-2">
                            {history.map(v => (
                              <div key={v.id} className="flex items-start gap-2.5 text-[11px]">
                                <StatusPill status={v.status} />
                                <span className="text-muted-foreground flex-shrink-0 whitespace-nowrap">
                                  {new Date(v.synthesized_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap flex-1">{v.override_text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
