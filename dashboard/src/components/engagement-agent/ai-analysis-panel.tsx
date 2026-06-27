'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import type { StoredSummary, RagSource } from '@/components/engagement/types'
import { timeAgo, fmtDateTime } from '@/components/engagement/helpers'
import { EmailTypeBadge } from './email-type-badge'
import { DraftProvenancePanel } from './draft-provenance-panel'
import { EvaluationSummary } from './evaluation-summary'

interface DraftMeta {
  emailType:   string | null
  generatedBy: string | null
  draftId:     string | null
  examples:    { id: string; context_summary: string | null; ideal_reply: string; score: number }[]
  watchOuts:   string[]
}

interface AiAnalysisPanelProps {
  summaries:       StoredSummary[]
  loading:         boolean
  threadId:        string | null
  latestMessageId: string | null
  ragSources:      RagSource[]
  onRefresh:       () => void
}

export function AiAnalysisPanel({
  summaries, loading, threadId, latestMessageId, ragSources, onRefresh,
}: AiAnalysisPanelProps) {
  const [regenerating, setRegenerating] = useState(false)
  const [regenErr,     setRegenErr]     = useState<string | null>(null)
  const [historyOpen,  setHistoryOpen]  = useState(false)
  const [meta,         setMeta]         = useState<DraftMeta | null>(null)

  const latest = summaries[0] ?? null
  const older  = summaries.slice(1)

  // Re-fetch draft-meta when thread changes or when summaries update (after a refresh)
  useEffect(() => {
    setMeta(null)
    if (!threadId) return
    fetch(`/api/engagement/draft-meta?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data && !data.error) setMeta(data) })
      .catch(() => {})
  }, [threadId, summaries[0]?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRegenerate() {
    if (!threadId || !latestMessageId) return
    setRegenerating(true); setRegenErr(null)
    try {
      const res = await fetch('/api/engagement/refresh-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, message_id: latestMessageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onRefresh()
    } catch (e) {
      setRegenErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="border-b border-[--border-subtle] flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-primary">AI Analysis</span>
          {meta?.emailType && <EmailTypeBadge type={meta.emailType} size="xs" />}
          {latest && (
            <span className="text-[9.5px] text-muted-foreground">· {timeAgo(latest.created_at)}</span>
          )}
          <Tip text="Generated automatically each time the contact sends a new email. Summarises the thread and suggests a next step." />
        </div>
        <div className="flex items-center gap-1.5">
          {regenErr && <span className="text-[9.5px] text-[--error] max-w-[80px] truncate">{regenErr}</span>}
          {threadId && latestMessageId && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="flex items-center gap-1 text-[10px] text-primary hover:opacity-80 disabled:opacity-50 transition-opacity"
            >
              <RefreshCw size={9} strokeWidth={2} className={cn(regenerating && 'animate-spin')} />
              {regenerating ? 'Generating…' : latest ? 'Refresh' : 'Generate'}
            </button>
          )}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        {(loading || regenerating) && (
          <p className="text-[11.5px] text-muted-foreground italic">Analysing thread…</p>
        )}

        {!loading && !regenerating && !latest && (
          <p className="text-[11.5px] text-muted-foreground italic leading-relaxed">
            Generates automatically on each new email, or click Refresh above.
          </p>
        )}

        {latest && (
          <>
            <p className="text-[12px] text-foreground/80 leading-[1.65] mb-2 m-0">{latest.summary}</p>

            {latest.next_action && (
              <div className="mb-2 px-2.5 py-2 bg-primary/5 rounded-lg border-l-2 border-primary/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Next action</p>
                <p className="text-[11.5px] text-primary/80 leading-relaxed m-0">{latest.next_action}</p>
              </div>
            )}

            {/* Draft provenance — how this draft was made */}
            {meta && (
              <DraftProvenancePanel
                generatedBy={meta.generatedBy}
                ragSources={ragSources}
                examples={meta.examples}
                watchOuts={meta.watchOuts}
              />
            )}

            {/* Self-improving signal */}
            {meta && meta.emailType && (meta.examples.length > 0 || meta.watchOuts.length > 0) && (
              <EvaluationSummary
                emailType={meta.emailType}
                examplesCount={meta.examples.length}
                watchOutsCount={meta.watchOuts.length}
              />
            )}

            {older.length > 0 && (
              <button
                onClick={() => setHistoryOpen(v => !v)}
                aria-expanded={historyOpen}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-2"
              >
                <ChevronDown size={9} className={cn('transition-transform', historyOpen && 'rotate-180')} />
                {older.length} earlier {older.length === 1 ? 'summary' : 'summaries'}
              </button>
            )}

            {historyOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {older.map(s => (
                  <div key={s.id} className="px-2.5 py-2 bg-muted rounded-lg">
                    <p className="text-[9.5px] text-muted-foreground mb-1 m-0">{fmtDateTime(s.created_at)}</p>
                    <p className="text-[11px] text-foreground/70 leading-[1.55] m-0">{s.summary}</p>
                    {s.next_action && (
                      <p className="text-[10.5px] text-muted-foreground italic mt-1 m-0">→ {s.next_action}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
