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

const TYPE_COLOR: Record<string, string> = {
  PRICING: '#2563eb', COVERAGE: '#7c3aed', RENEWAL: '#d97706',
  DOCUMENT: '#0891b2', CLAIMS: '#dc2626', CONVERSATION: '#059669',
}
const SCORE_COLOR = (s: number) => s >= 4 ? '#16a34a' : s === 3 ? '#d97706' : '#dc2626'

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
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
  }, [])

  const avgAll = evals.length
    ? Math.round((evals.reduce((s, e) => s + (e.score ?? 0), 0) / evals.length) * 10) / 10
    : null

  const learnings = evals.map(e => e.eval_json?.key_learning).filter((l): l is string => !!l && l.length > 10)
  const learningsByType: Record<string, string[]> = {}
  evals.forEach(e => {
    const t = e.email_type ?? 'UNKNOWN'; const l = e.eval_json?.key_learning
    if (!l) return
    if (!learningsByType[t]) learningsByType[t] = []
    if (!learningsByType[t].includes(l)) learningsByType[t].push(l)
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Email Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How closely AI drafts matched what was actually sent — and what the model is learning
        </p>
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
                  <div key={s.email_type} className="border border-border rounded-lg px-4 py-3 min-w-[110px] bg-muted/30">
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
                      <div key={e.id} className={cn(i < evals.length - 1 && 'border-b border-border/50')}>
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
                ) : Object.entries(learningsByType).map(([type, rules]) => (
                  <Card key={type}>
                    <CardHeader className="pb-2 flex-row items-center gap-2">
                      <TypePill type={type} />
                      <span className="text-[12px] text-muted-foreground">{rules.length} rule{rules.length !== 1 ? 's' : ''} learned</span>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex flex-col gap-2 list-disc pl-4">
                        {rules.map((r, i) => (
                          <li key={i} className="text-[13px] text-foreground leading-relaxed">{r}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
                <div className="border border-dashed border-border rounded-xl p-5 bg-muted/30">
                  <p className="text-[12px] font-semibold text-foreground mb-1.5">How to use these</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Each learning is a rule extracted from differences between AI drafts and what was actually sent.
                    Add the most frequent rules to the prompt in{' '}
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">src/app/api/engagement/draft/route.ts</code>.
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
                      <div key={ex.id} className={cn(i < examples.length - 1 && 'border-b border-border/50')}>
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
                            <pre className="text-[12px] text-foreground bg-muted/50 border border-border rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-sans max-h-72 overflow-y-auto">
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
        </>
      )}
    </div>
  )
}
