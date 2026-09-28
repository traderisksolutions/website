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
import { InlineProgress, useFauxProgress } from '@/components/engagement/InlineProgress'

/** Summary, next action and draft provenance for the open thread. Quiet AI: ink text on white,
 *  one field-grey block for the next action, text links for the actions. */

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'
const FIELD = '#f1f3f4'

const LINK = 'bg-transparent border-0 p-0 cursor-pointer text-[13px] underline underline-offset-[3px] decoration-[#9aa0a6] hover:decoration-[#202124] disabled:cursor-default disabled:no-underline disabled:opacity-50'

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

  const analysing = loading || regenerating
  const analysisPct = useFauxProgress(analysing)

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
    <div className="flex-shrink-0" style={{ borderBottom: `1px solid ${HAIR}` }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[13px] font-medium" style={{ color: INK }}>Analysis</span>
          {meta?.emailType && <EmailTypeBadge type={meta.emailType} size="xs" />}
          {latest && (
            <span className="text-[12px]" style={{ color: FAINT }}>· {timeAgo(latest.created_at)}</span>
          )}
          <Tip text="Generated each time the contact sends a new email. Summarises the thread and suggests a next step." />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {regenErr && <span className="text-[12px] max-w-[120px] truncate" style={{ color: BODY }} role="alert">{regenErr}</span>}
          {threadId && latestMessageId && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className={cn(LINK, 'inline-flex items-center gap-1')}
              style={{ color: INK }}
            >
              <RefreshCw size={11} strokeWidth={2} className={cn(regenerating && 'animate-spin')} aria-hidden />
              {regenerating ? 'Generating…' : latest ? 'Refresh' : 'Generate'}
            </button>
          )}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        {analysing && (
          <InlineProgress value={analysisPct} label="Analysing thread…" className="py-1" />
        )}

        {!loading && !regenerating && !latest && (
          <p className="text-[13px] leading-relaxed m-0" style={{ color: MUTED }}>
            Generated on each new email. Refresh above to run it now.
          </p>
        )}

        {latest && (
          <>
            <p className="text-[13px] leading-[1.6] m-0 mb-2.5" style={{ color: BODY }}>{latest.summary}</p>

            {latest.next_action && (
              <div className="mb-2 px-3 py-2.5 rounded-[10px]" style={{ background: FIELD }}>
                <p className="text-[12px] m-0 mb-1" style={{ color: MUTED }}>Next action</p>
                <p className="text-[13px] leading-relaxed m-0" style={{ color: INK }}>{latest.next_action}</p>
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
                type="button"
                onClick={() => setHistoryOpen(v => !v)}
                aria-expanded={historyOpen}
                className={cn(LINK, 'inline-flex items-center gap-1 mt-2.5')}
                style={{ color: MUTED }}
              >
                <ChevronDown size={12} className={cn('transition-transform', historyOpen && 'rotate-180')} aria-hidden />
                {older.length} earlier {older.length === 1 ? 'summary' : 'summaries'}
              </button>
            )}

            {historyOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {older.map(s => (
                  <div key={s.id} className="px-3 py-2.5 rounded-[10px]" style={{ background: FIELD }}>
                    <p className="text-[12px] m-0 mb-1" style={{ color: FAINT }}>{fmtDateTime(s.created_at)}</p>
                    <p className="text-[12.5px] leading-[1.55] m-0" style={{ color: BODY }}>{s.summary}</p>
                    {s.next_action && (
                      <p className="text-[12.5px] mt-1 m-0" style={{ color: MUTED }}>Next: {s.next_action}</p>
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
