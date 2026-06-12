'use client'

import { useEffect, useState } from 'react'

interface EvalRow {
  id:         string
  email_type: string | null
  score:      number
  eval_json:  {
    what_human_changed: string
    why_better:         string
    key_learning:       string
    context_summary:    string
  } | null
  created_at: string
}

interface ExampleRow {
  id:              string
  email_type:      string
  context_summary: string
  ideal_reply:     string
  score:           number
  created_at:      string
}

interface Stat {
  email_type: string
  count:      number
  avg_score:  number
}

const TYPE_COLOR: Record<string, string> = {
  PRICING:      '#2563eb',
  COVERAGE:     '#7c3aed',
  RENEWAL:      '#d97706',
  DOCUMENT:     '#0891b2',
  CLAIMS:       '#dc2626',
  CONVERSATION: '#059669',
}

const SCORE_COLOR = (s: number) =>
  s >= 4 ? '#16a34a' : s === 3 ? '#d97706' : '#dc2626'

function ScoreBadge({ score }: { score: number }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: SCORE_COLOR(score) + '18', color: SCORE_COLOR(score), whiteSpace: 'nowrap',
    }}>
      {'★'.repeat(score)}{'☆'.repeat(5 - score)} {score}/5
    </span>
  )
}

function TypePill({ type }: { type: string | null }) {
  const c = TYPE_COLOR[type ?? ''] ?? '#6b7280'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
      background: c + '14', color: c, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {type ?? 'UNKNOWN'}
    </span>
  )
}

export default function EvalPage() {
  const [evals,    setEvals]    = useState<EvalRow[]>([])
  const [examples, setExamples] = useState<ExampleRow[]>([])
  const [stats,    setStats]    = useState<Stat[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'evals' | 'examples' | 'learnings'>('evals')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/engagement/evaluate?limit=100', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { evaluations: [], examples: [], stats: [] })
      .then((d: { evaluations?: EvalRow[]; examples?: ExampleRow[]; stats?: Stat[] }) => {
        setEvals(Array.isArray(d.evaluations) ? d.evaluations : [])
        setExamples(Array.isArray(d.examples)  ? d.examples  : [])
        setStats(Array.isArray(d.stats)        ? d.stats     : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const avgAll = evals.length
    ? Math.round((evals.reduce((s, e) => s + (e.score ?? 0), 0) / evals.length) * 10) / 10
    : null

  // Unique key learnings across all evaluations (deduplicated)
  const learnings = evals
    .map(e => e.eval_json?.key_learning)
    .filter((l): l is string => !!l && l.length > 10)

  const learningsByType: Record<string, string[]> = {}
  evals.forEach(e => {
    const t = e.email_type ?? 'UNKNOWN'
    const l = e.eval_json?.key_learning
    if (!l) return
    if (!learningsByType[t]) learningsByType[t] = []
    if (!learningsByType[t].includes(l)) learningsByType[t].push(l)
  })

  function tabBtn(key: typeof tab, label: string) {
    const active = tab === key
    return (
      <button
        onClick={() => setTab(key)}
        style={{
          fontSize: 13, fontWeight: active ? 600 : 400, padding: '6px 16px', border: 'none',
          borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
          background: 'transparent', color: active ? '#2563eb' : '#6b7280', cursor: 'pointer',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
          Draft Evaluation
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>
          How closely the AI draft matched what was actually sent — and what the AI is learning
        </p>
      </div>

      {loading ? (
        <p style={{ color: '#bbb', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          {/* ── Summary stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Total Evaluated</p>
              <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: '#111', letterSpacing: '-0.03em' }}>{evals.length}</p>
            </div>

            {avgAll !== null && (
              <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
                <p style={{ margin: 0, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Avg Score</p>
                <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: SCORE_COLOR(avgAll), letterSpacing: '-0.03em' }}>{avgAll}<span style={{ fontSize: 13, color: '#aaa', fontWeight: 400 }}>/5</span></p>
              </div>
            )}

            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Examples Stored</p>
              <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: '#2563eb', letterSpacing: '-0.03em' }}>{examples.length}</p>
            </div>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Learnings</p>
              <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: '#7c3aed', letterSpacing: '-0.03em' }}>{learnings.length}</p>
            </div>

          </div>

          {/* ── Per-type score breakdown ── */}
          {stats.length > 0 && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', background: '#fff', marginBottom: 24 }}>
              <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#374151' }}>Score by Email Type</p>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {stats.map(s => (
                  <div key={s.email_type} style={{
                    border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px',
                    minWidth: 110, background: '#fafafa',
                  }}>
                    <TypePill type={s.email_type} />
                    <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700, color: SCORE_COLOR(s.avg_score), letterSpacing: '-0.02em' }}>
                      {s.avg_score}<span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}>/5</span>
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#bbb' }}>{s.count} eval{s.count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tabs ── */}
          <div style={{ borderBottom: '1px solid #e5e5e5', marginBottom: 16, display: 'flex', gap: 0 }}>
            {tabBtn('evals',     `Evaluations (${evals.length})`)}
            {tabBtn('learnings', `Prompt Learnings (${learnings.length})`)}
            {tabBtn('examples',  `Few-Shot Examples (${examples.length})`)}
          </div>

          {/* ── Evaluations tab ── */}
          {tab === 'evals' && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              {evals.length === 0 ? (
                <p style={{ padding: '24px 20px', margin: 0, fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>
                  No evaluations yet — they appear automatically after every sent email.
                </p>
              ) : evals.map((e, i) => (
                <div key={e.id} style={{ borderBottom: i < evals.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <button
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <TypePill type={e.email_type} />
                    <ScoreBadge score={e.score} />
                    <span style={{ flex: 1, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.eval_json?.what_human_changed ?? '—'}
                    </span>
                    <span style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(e.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                    </span>
                  </button>
                  {expanded === e.id && e.eval_json && (
                    <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        { label: 'What changed',   val: e.eval_json.what_human_changed },
                        { label: 'Why better',      val: e.eval_json.why_better },
                        { label: '💡 Key learning', val: e.eval_json.key_learning },
                        { label: 'Context',         val: e.eval_json.context_summary },
                      ].map(row => row.val ? (
                        <div key={row.label} style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 90, fontWeight: 600, paddingTop: 1 }}>{row.label}</span>
                          <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{row.val}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Learnings tab ── */}
          {tab === 'learnings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Object.keys(learningsByType).length === 0 ? (
                <p style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>No learnings yet.</p>
              ) : Object.entries(learningsByType).map(([type, rules]) => (
                <div key={type} style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                  <div style={{ padding: '10px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TypePill type={type} />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{rules.length} rule{rules.length !== 1 ? 's' : ''} learned</span>
                  </div>
                  <ul style={{ margin: 0, padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rules.map((r, i) => (
                      <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div style={{ border: '1px dashed #e5e7eb', borderRadius: 10, padding: '16px 20px', background: '#fafafa' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>How to use these</p>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
                  Each learning is a specific rule extracted from differences between AI drafts and what was actually sent.
                  When enough patterns accumulate for one email type, add the most frequent rules directly into the generation prompt
                  in <code style={{ fontSize: 11, background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>src/app/api/engagement/draft/route.ts</code>.
                </p>
              </div>
            </div>
          )}

          {/* ── Examples tab ── */}
          {tab === 'examples' && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              {examples.length === 0 ? (
                <p style={{ padding: '24px 20px', margin: 0, fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>
                  No examples yet — examples are stored automatically when a sent reply scores 4 or 5.
                </p>
              ) : examples.map((ex, i) => (
                <div key={ex.id} style={{ borderBottom: i < examples.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <button
                    onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <TypePill type={ex.email_type} />
                    <ScoreBadge score={ex.score} />
                    <span style={{ flex: 1, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ex.context_summary || '(no summary)'}
                    </span>
                    <span style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(ex.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                    </span>
                  </button>
                  {expanded === ex.id && (
                    <div style={{ padding: '0 16px 14px' }}>
                      {ex.context_summary && (
                        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9ca3af' }}>{ex.context_summary}</p>
                      )}
                      <pre style={{
                        margin: 0, fontSize: 12, color: '#1e3a5f', background: '#f8fafc',
                        border: '1px solid #e5e7eb', borderRadius: 6,
                        padding: '10px 12px', whiteSpace: 'pre-wrap', lineHeight: 1.6,
                        fontFamily: 'inherit', maxHeight: 300, overflowY: 'auto',
                      }}>
                        {ex.ideal_reply}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
