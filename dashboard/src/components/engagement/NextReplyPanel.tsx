'use client'

/**
 * "What's next" on a thread — the client-relationship agent, in the inbox.
 *
 * Deliberately sits beside the composer rather than inside it. The composer owns the editor, the
 * stored draft and the send path; putting a second writer into it risks the reply flow for a
 * convenience. This asks, shows, and hands the text over on a copy. Nothing here sends.
 */

import { useState } from 'react'
import { Sparkles, Copy, Check, Paperclip, ChevronDown, ChevronRight } from 'lucide-react'

const INK = '#202124'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'

type Citation = { n: number; source: 'message' | 'attachment'; fileName: string | null; sentAt: string | null }
type Passage = { n: number; source: string; fileName: string | null; sentAt: string | null; similarity: number; excerpt: string }
type Result = {
  situation: string; nextAction: string; openItems: string[]; draft: string
  citations: Citation[]; proposedAttachments: { fileName: string; reason: string }[]
  provenance: string; model: string
  read: { threads: number; archivePassages: number; archiveThreads: number }
  error?: string
}

export function NextReplyPanel({ threadId }: { threadId: string }) {
  const [r, setR] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function run() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/crm/next-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      })
      const j = await res.json() as Result
      if (!res.ok || j.error) setErr(j.error ?? `Request failed (${res.status})`)
      else { setR(j); setOpen(true) }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(false) }
  }

  async function copy() {
    if (!r?.draft) return
    try {
      await navigator.clipboard.writeText(r.draft)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard refused; the text is on screen to select */ }
  }

  return (
    <div className="px-5 sm:px-10 py-2.5" style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button" onClick={run} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[13px] transition-colors hover:border-[#202124] disabled:opacity-50"
          style={{ borderColor: '#dadce0', color: INK }}
        >
          <Sparkles size={13} className={busy ? 'animate-pulse' : ''} />
          {busy ? 'Reading the client’s file…' : r ? 'Read again' : 'What’s next'}
        </button>

        {r && (
          <>
            <button type="button" onClick={() => setOpen(o => !o)}
              className="inline-flex items-center gap-1 text-[12px]" style={{ color: FAINT }}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {open ? 'Hide' : 'Show'}
            </button>
            <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
              read {r.read.threads} thread{r.read.threads === 1 ? '' : 's'}
              {r.read.archivePassages > 0 && ` · ${r.read.archivePassages} passages from ${r.read.archiveThreads} other`}
            </span>
          </>
        )}
      </div>

      {err && <p className="mt-2 text-[13px]" style={{ color: INK }}>{err}</p>}

      {r && open && (
        <div className="mt-3 space-y-3 pb-1">
          {r.situation && (
            <p className="text-[13px] leading-[1.6]" style={{ color: MUTED }}>{r.situation}</p>
          )}

          {r.nextAction && (
            <div className="rounded-[10px] px-3 py-2.5" style={{ border: `1px solid ${HAIR}` }}>
              <div className="text-[11px] uppercase tracking-[0.04em]" style={{ color: FAINT }}>Next</div>
              <p className="mt-1 text-[13px] leading-[1.6]" style={{ color: INK }}>{r.nextAction}</p>
            </div>
          )}

          {r.openItems.length > 0 && (
            <ul className="space-y-1 pl-4">
              {r.openItems.map((x, i) => (
                <li key={i} className="list-disc text-[13px] leading-[1.6]" style={{ color: MUTED }}>{x}</li>
              ))}
            </ul>
          )}

          {r.draft && (
            <div className="rounded-[10px]" style={{ border: `1px solid ${HAIR}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
                <span className="text-[11px] uppercase tracking-[0.04em]" style={{ color: FAINT }}>Draft</span>
                <button type="button" onClick={copy}
                  className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: copied ? INK : MUTED }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="px-3 py-2.5 text-[13px] leading-[1.65] whitespace-pre-wrap" style={{ color: INK }}>{r.draft}</p>
            </div>
          )}

          {r.proposedAttachments.length > 0 && (
            <div className="text-[12px]" style={{ color: MUTED }}>
              <span style={{ color: FAINT }}>Attach: </span>
              {r.proposedAttachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 mr-2.5">
                  <Paperclip size={11} />{a.fileName}
                </span>
              ))}
            </div>
          )}

          {r.citations.length > 0 && (
            <p className="text-[12px] leading-[1.6] whitespace-pre-wrap" style={{ color: FAINT }}>{r.provenance}</p>
          )}
        </div>
      )}
    </div>
  )
}

export type { Passage }
