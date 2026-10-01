'use client'

/**
 * The two agents on a thread, side by side. The only difference between them is how far they
 * read, and the labels are chosen so that is the thing a reader notices:
 *
 *   Generate response — reads the company record and every other thread for this client, then
 *                       writes the reply straight into the composer with its sources listed and
 *                       the files to attach named.
 *   Ask AI           — answers a question about THIS thread only: its messages, the text of its
 *                       own attachments, and the web. It never reaches the client's other threads.
 *
 * Generate response writes into the composer through `pendingRestore`, the same path a restored
 * draft already uses, so the editor, the draft row and the send flow are untouched.
 */

import { useState } from 'react'
import { Sparkles, Search, Paperclip, ExternalLink, X } from 'lucide-react'

const INK = '#202124'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'

type Citation = { n: number; source: 'message' | 'attachment'; fileName: string | null; sentAt: string | null }
type NextReply = {
  situation: string; nextAction: string; openItems: string[]; draft: string
  citations: Citation[]; proposedAttachments: { fileName: string; reason: string }[]
  provenance: string; model: string; draftId: string | null
  read: { threads: number; archivePassages: number; archiveThreads: number }
  error?: string
}
type Answer = {
  answer: string; sources: { n: number; title: string; uri: string }[]
  queries: string[]; grounded: boolean; warning: string | null; error?: string
}

const btn = 'inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[13px] transition-colors hover:border-[#202124] disabled:opacity-50'

export function ThreadAgentBar({
  threadId, onDraft,
}: {
  threadId: string
  /** Hands the finished reply to the composer. */
  onDraft: (bodyHtml: string) => void
}) {
  const [busy, setBusy] = useState<'gen' | 'ask' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [reply, setReply] = useState<NextReply | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)

  async function generate() {
    setBusy('gen'); setErr(null); setAnswer(null)
    try {
      const res = await fetch('/api/crm/next-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      })
      const j = await res.json() as NextReply
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); return }
      setReply(j)
      // Straight into the reply box. Plain text with blank lines between paragraphs is what the
      // editor expects; the composer converts and remounts on its own.
      if (j.draft) onDraft(j.draft)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(null) }
  }

  async function ask() {
    const q = question.trim()
    if (!q) return
    setBusy('ask'); setErr(null); setReply(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, threadId }),
      })
      const j = await res.json() as Answer
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); return }
      setAnswer(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(null) }
  }

  return (
    <div className="px-5 sm:px-10 py-2.5" style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generate} disabled={!!busy} className={btn} style={{ borderColor: '#dadce0', color: INK }}>
          <Sparkles size={13} className={busy === 'gen' ? 'animate-pulse' : ''} />
          {busy === 'gen' ? 'Reading the client’s file…' : 'Generate response'}
        </button>

        <button type="button" onClick={() => { setAsking(a => !a); setErr(null) }} disabled={!!busy} className={btn}
          style={{ borderColor: asking ? INK : '#dadce0', color: INK }}>
          <Search size={13} /> Ask AI
        </button>

        {reply && (
          <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
            read {reply.read.threads} thread{reply.read.threads === 1 ? '' : 's'}
            {reply.read.archivePassages > 0 && ` · ${reply.read.archivePassages} passages from ${reply.read.archiveThreads} other`}
            {reply.draft && ' · written into the reply'}
          </span>
        )}
        {answer && (
          <span className="text-[12px]" style={{ color: FAINT }}>
            this thread only{answer.grounded ? ` · ${answer.sources.length} web sources` : ' · not web-checked'}
          </span>
        )}
      </div>

      {asking && (
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <input
            id="thread-ask" value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ask() } }}
            placeholder="Ask about this thread or its attachments…"
            className="h-9 flex-1 min-w-0 rounded-[9px] border px-3 text-[13px]"
            style={{ borderColor: '#dadce0', color: INK }}
          />
          <button type="button" onClick={ask} disabled={!!busy || !question.trim()} className={btn}
            style={{ borderColor: '#dadce0', color: INK }}>
            {busy === 'ask' ? 'Reading…' : 'Ask'}
          </button>
          <button type="button" onClick={() => { setAsking(false); setAnswer(null); setQuestion('') }}
            className="p-1.5" style={{ color: FAINT }} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      )}

      {err && <p className="mt-2 text-[13px]" style={{ color: INK }}>{err}</p>}

      {reply && (
        <div className="mt-3 space-y-2.5 pb-1">
          {reply.situation && <p className="text-[13px] leading-[1.6]" style={{ color: MUTED }}>{reply.situation}</p>}
          {reply.nextAction && (
            <div className="rounded-[10px] px-3 py-2.5" style={{ border: `1px solid ${HAIR}` }}>
              <div className="text-[11px] uppercase tracking-[0.04em]" style={{ color: FAINT }}>Next</div>
              <p className="mt-1 text-[13px] leading-[1.6]" style={{ color: INK }}>{reply.nextAction}</p>
            </div>
          )}
          {reply.openItems.length > 0 && (
            <ul className="space-y-1 pl-4">
              {reply.openItems.map((x, i) => (
                <li key={i} className="list-disc text-[13px] leading-[1.6]" style={{ color: MUTED }}>{x}</li>
              ))}
            </ul>
          )}
          {reply.proposedAttachments.length > 0 && (
            <div className="text-[12px]" style={{ color: MUTED }}>
              <span style={{ color: FAINT }}>Attach: </span>
              {reply.proposedAttachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 mr-2.5"><Paperclip size={11} />{a.fileName}</span>
              ))}
            </div>
          )}
          {reply.citations.length > 0 && (
            <p className="text-[12px] leading-[1.6] whitespace-pre-wrap" style={{ color: FAINT }}>{reply.provenance}</p>
          )}
        </div>
      )}

      {answer && (
        <div className="mt-3 space-y-2.5 pb-1">
          {answer.warning && (
            <p className="rounded-[10px] px-3 py-2 text-[12px] leading-[1.6]" style={{ border: `1px solid ${INK}`, color: INK }}>
              {answer.warning}
            </p>
          )}
          <p className="text-[13px] leading-[1.65] whitespace-pre-wrap" style={{ color: MUTED }}>{answer.answer}</p>
          {answer.sources.length > 0 && (
            <ol className="space-y-1">
              {answer.sources.map(s => (
                <li key={s.n} className="flex gap-2 text-[12px]">
                  <span className="tabular-nums shrink-0" style={{ color: FAINT }}>[{s.n}]</span>
                  <a href={s.uri} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 underline decoration-[#dadce0] hover:decoration-[#202124]"
                     style={{ color: INK }}>
                    {s.title || s.uri}<ExternalLink size={11} style={{ color: FAINT }} />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
