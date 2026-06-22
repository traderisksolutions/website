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
interface OverrideRow {
  id: string; email_type: string; override_text: string; synthesized_at: string; source_eval_count: number
}

const TYPE_COLOR: Record<string, string> = {
  PRICING: '#2563eb', COVERAGE: '#7c3aed', RENEWAL: '#d97706',
  DOCUMENT: '#0891b2', CLAIMS: '#dc2626', CONVERSATION: '#059669',
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
  const c = TYPE_COLOR[type ?? ''] ?? '#6b7280'
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide"
      style={{ background: c + '14', color: c }}
    >
      {type ?? 'UNKNOWN'}
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

  async function loadOverrides() {
    fetch('/api/engagement/improve-prompt', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: OverrideRow[]) => setOverrides(Array.isArray(d) ? d : []))
      .catch(() => {})
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
        await loadOverrides()
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Email Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How closely AI drafts matched what was actually sent — and what the model is learning
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Evaluated', value: evals.length,    color: 'text-foreground' },
              { label: 'Avg Score',       value: avgAll !== null ? `${avgAll}/5` : '—', color: avgAll ? `text-[${SCORE_COLOR(avgAll)}]` : '' },
              { label: 'Examples Stored', value: examples.length,  color: 'text-primary' },
              { label: 'Learnings',       value: learnings.length,  color: 'text-violet-600' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{s.label}</p>
                  <p className={cn('text-3xl font-bold tracking-tight', s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per-type breakdown */}
          {stats.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Score by Email Type</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 pt-0">
                {stats.map(s => (
                  <div key={s.email_type} className="border border-[--border-subtle] rounded-lg px-4 py-3 min-w-[110px] bg-muted/30">
                    <TypePill type={s.email_type} />
                    <p className="mt-2 text-[20px] font-bold tracking-tight" style={{ color: SCORE_COLOR(s.avg_score) }}>
                      {s.avg_score}<span className="text-[11px] text-muted-foreground font-normal ml-0.5">/5</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.count} eval{s.count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="evals">
            <TabsList className="mb-4">
              <TabsTrigger value="evals">Evaluations ({evals.length})</TabsTrigger>
              <TabsTrigger value="learnings">Prompt Learnings ({learnings.length})</TabsTrigger>
              <TabsTrigger value="examples">Few-Shot Examples ({examples.length})</TabsTrigger>
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
                ) : Object.entries(learningsByType).map(([type, rules]) => {
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

            {/* Examples tab */}
            <TabsContent value="examples">
              <Card>
                {examples.length === 0 ? (
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground italic">No examples yet — stored automatically when a reply scores 4 or 5.</p>
                  </CardContent>
                ) : (
                  <CardContent className="p-0">
                    {examples.map((ex, i) => (
                      <div key={ex.id} className={cn(i < examples.length - 1 && 'border-b border-[--border-subtle]')}>
                        <button
                          onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        >
                          <TypePill type={ex.email_type} />
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
                )}
              </Card>
            </TabsContent>
          </Tabs>

          {/* ── Auto-prompt Improvement ──────────────────────────────────── */}
          <div className="mt-8 border-t border-[--border-subtle] pt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Auto-Prompt Improvement</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Reads all evaluations, synthesises them into refined rules via AI, and writes them live into the engagement agent prompt.
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

            {overrides.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-5 bg-muted/20">
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  No synthesised rules yet. Once you have several evaluations, click <strong>Synthesise Prompt Improvements</strong> to generate a refined ruleset.
                  The agent will use these instead of raw learnings — more precise and consistent.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {overrides.map(o => (
                  <Card key={o.id}>
                    <CardHeader className="pb-2 flex-row items-center gap-2 flex-wrap">
                      <TypePill type={o.email_type} />
                      <span className="text-[11px] text-muted-foreground">{o.source_eval_count} eval{o.source_eval_count !== 1 ? 's' : ''} used</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        ✦ live in prompt
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {new Date(o.synthesized_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed font-sans">
                        {o.override_text}
                      </pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
