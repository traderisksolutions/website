'use client'

import React, { useRef, useEffect } from 'react'
import { ArrowUp, Square, Paperclip, X, Loader2, FileText } from 'lucide-react'

export function FloatingChatComposer({
  draft, sending, attachments, attaching, onChange, onSend, onStop, onAttachFiles, onRemoveAttach,
}: {
  draft: string; sending: boolean
  attachments: { filename: string }[]; attaching: boolean
  onChange: (v: string) => void; onSend: () => void; onStop: () => void
  onAttachFiles: (files: FileList) => void; onRemoveAttach: (i: number) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [draft])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  return (
    <div className="border-t border-[--border-subtle] p-2.5">
      {(attachments.length > 0 || attaching) && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {attachments.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10.5px] rounded-md border border-[--border-subtle] bg-muted/50 pl-1.5 pr-1 py-0.5 text-foreground/80">
              <FileText size={10} /> <span className="max-w-[120px] truncate">{a.filename}</span>
              <button onClick={() => onRemoveAttach(i)} aria-label="Remove attachment" className="text-muted-foreground/60 hover:text-foreground"><X size={11} /></button>
            </span>
          ))}
          {attaching && <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground/70"><Loader2 size={11} className="animate-spin" /> Reading…</span>}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-[--border-subtle] bg-background px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/25">
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) onAttachFiles(e.target.files); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} aria-label="Attach file" title="Attach a file for the consultant to read"
          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Paperclip size={15} />
        </button>
        <textarea
          ref={ref}
          value={draft}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Message the consultant…  (Enter to send, Shift+Enter for a new line)"
          aria-label="Message the consultant"
          className="flex-1 resize-none bg-transparent text-[12.5px] leading-[1.5] outline-none placeholder:text-muted-foreground/50 max-h-[140px]"
        />
        {sending ? (
          <button onClick={onStop} aria-label="Stop generating"
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-foreground/80 text-background flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button onClick={onSend} disabled={!draft.trim() && attachments.length === 0} aria-label="Send message"
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <ArrowUp size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
