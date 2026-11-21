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
 *
 * The state lives in `useThreadAgent`, owned by the thread view, so the two buttons can sit above
 * the folded reply line (`ThreadAgentBar`) or in the open composer's footer (`ThreadAgentButtons`)
 * while the results stay above the composer (`ThreadAgentResults`).
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Search, Paperclip, ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, inputCls, type BtnLevel } from '@/components/crm/primitives'

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

export type ThreadAgent = ReturnType<typeof useThreadAgent>

/** The two agents' state for one thread. `onDraft` hands the finished reply to the composer. */
export function useThreadAgent(threadId: string | null, onDraft: (bodyHtml: string) => void) {
  const [busy, setBusy] = useState<'gen' | 'ask' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [reply, setReply] = useState<NextReply | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const onDraftRef = useRef(onDraft)
  onDraftRef.current = onDraft
  // A reply that lands after the reader moved to another thread is dropped.
  const liveRef = useRef(threadId)
  liveRef.current = threadId

  // A new thread starts clean, as the bar did when it remounted per thread.
  useEffect(() => { setBusy(null); setErr(null); setReply(null); setAsking(false); setQuestion(''); setAnswer(null) }, [threadId])

  async function generate() {
    const tid = threadId
    if (!tid) return
    setBusy('gen'); setErr(null); setAnswer(null)
    try {
      const res = await fetch('/api/crm/next-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: tid }),
      })
      const j = await res.json() as NextReply
      if (liveRef.current !== tid) return
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); return }
      setReply(j)
      // Straight into the reply box. Plain text with blank lines between paragraphs is what the
      // editor expects; the composer converts and remounts on its own.
      if (j.draft) onDraftRef.current(j.draft)
    } catch (e) {
      if (liveRef.current === tid) setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { if (liveRef.current === tid) setBusy(null) }
  }

  async function ask() {
    const tid = threadId
    const q = question.trim()
    if (!q || !tid) return
    setBusy('ask'); setErr(null); setReply(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, threadId: tid }),
      })
      const j = await res.json() as Answer
      if (liveRef.current !== tid) return
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); return }
      setAnswer(j)
    } catch (e) {
      if (liveRef.current === tid) setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { if (liveRef.current === tid) setBusy(null) }
  }

  const toggleAsk = () => { setAsking(a => !a); setErr(null) }
  const closeAsk = () => { setAsking(false); setAnswer(null); setQuestion('') }

  return { busy, err, reply, asking, question, setQuestion, answer, generate, ask, toggleAsk, closeAsk }
}

/** Generate response and Ask AI, at the level the place asks for (secondary above the reply
 *  line, tertiary beside Send). */
export function ThreadAgentButtons({ agent, level = 'secondary' }: { agent: ThreadAgent; level?: BtnLevel }) {
  const { busy, asking } = agent
  return (
    <>
      <Btn level={level} size="xs" onClick={() => void agent.generate()} disabled={!!busy}>
        <Sparkles size={13} className={busy === 'gen' ? 'animate-pulse' : ''} />
        {busy === 'gen' ? 'Reading the client’s file…' : 'Generate response'}
      </Btn>
      <Btn level={level} size="xs" onClick={agent.toggleAsk} disabled={!!busy} aria-pressed={asking} className={cn(asking && 'bg-trs-tint text-trs-ink')}>
        <Search size={13} /> Ask AI
      </Btn>
    </>
  )
}

/** What the agents returned: the read line, the question field, any error, the reply's notes or the answer. */
export function ThreadAgentResults({ agent }: { agent: ThreadAgent }) {
  const { busy, err, reply, asking, question, answer } = agent
  return (
    <>
      {(reply || answer) && (
        <p className="m-0 text-small tabular-nums text-trs-subtle">
          {reply && <>
            read {reply.read.threads} thread{reply.read.threads === 1 ? '' : 's'}
            {reply.read.archivePassages > 0 && ` · ${reply.read.archivePassages} passages from ${reply.read.archiveThreads} other`}
            {reply.draft && ' · written into the reply'}
          </>}
          {answer && <>this thread only{answer.grounded ? ` · ${answer.sources.length} web sources` : ' · not web-checked'}</>}
        </p>
      )}

      {asking && (
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <input
            id="thread-ask" value={question} onChange={e => agent.setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void agent.ask() } }}
            placeholder="Ask about this thread or its attachments…"
            className={cn(inputCls, 'h-8 w-auto flex-1 min-w-0')}
          />
          <Btn level="secondary" size="xs" onClick={() => void agent.ask()} disabled={!!busy || !question.trim()}>
            {busy === 'ask' ? 'Reading…' : 'Ask'}
          </Btn>
          <Btn level="tertiary" size="xs" onClick={agent.closeAsk}
            className="w-8 px-0 text-trs-subtle" aria-label="Close">
            <X size={14} />
          </Btn>
        </div>
      )}

      {err && <p className="mt-2 text-body text-trs-ink" >{err}</p>}

      {reply && (
        <div className="mt-3 space-y-2.5 pb-1">
          {reply.situation && <p className="text-body leading-[1.6] text-trs-muted" >{reply.situation}</p>}
          {reply.nextAction && (
            <div className="rounded px-3 py-2.5 border border-trs-line">
              <div className="text-small text-trs-subtle" >Next</div>
              <p className="mt-1 text-body leading-[1.6] text-trs-ink" >{reply.nextAction}</p>
            </div>
          )}
          {reply.openItems.length > 0 && (
            <ul className="space-y-1 pl-4">
              {reply.openItems.map((x, i) => (
                <li key={i} className="list-disc text-body leading-[1.6] text-trs-muted" >{x}</li>
              ))}
            </ul>
          )}
          {reply.proposedAttachments.length > 0 && (
            <div className="text-small text-trs-muted" >
              <span className="text-trs-subtle">Attach: </span>
              {reply.proposedAttachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 mr-2.5"><Paperclip size={11} />{a.fileName}</span>
              ))}
            </div>
          )}
          {reply.citations.length > 0 && (
            <p className="text-small leading-[1.6] whitespace-pre-wrap text-trs-subtle" >{reply.provenance}</p>
          )}
        </div>
      )}

      {answer && (
        <div className="mt-3 space-y-2.5 pb-1">
          {answer.warning && (
            <p className="rounded px-3 py-2 text-small leading-[1.6] border border-trs-ink text-trs-muted">
              {answer.warning}
            </p>
          )}
          <p className="text-body leading-[1.65] whitespace-pre-wrap text-trs-muted" >{answer.answer}</p>
          {answer.sources.length > 0 && (
            <ol className="space-y-1">
              {answer.sources.map(s => (
                <li key={s.n} className="flex gap-2 text-small">
                  <span className="tabular-nums shrink-0 text-trs-subtle" >[{s.n}]</span>
                  <a href={s.uri} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 underline decoration-trs-line-2 hover:decoration-trs-ink text-trs-ink"
                     >
                    {s.title || s.uri}<ExternalLink size={11} className="text-trs-subtle" />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  )
}

/** Is there anything for `ThreadAgentResults` to show. */
export const hasAgentResults = (a: ThreadAgent) => !!(a.reply || a.answer || a.asking || a.err)

/** The folded state: both buttons above the reply line, the results under them. */
export function ThreadAgentBar({ agent }: { agent: ThreadAgent }) {
  return (
    <div className="px-5 sm:px-10 py-2.5 border-t border-trs-line">
      <div className="flex flex-wrap items-center gap-2">
        <ThreadAgentButtons agent={agent} />
      </div>
      {hasAgentResults(agent) && <div className="mt-2.5"><ThreadAgentResults agent={agent} /></div>}
    </div>
  )
}
