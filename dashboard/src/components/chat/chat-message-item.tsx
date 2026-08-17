'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, RefreshCw, Mail, PencilLine, Check, RotateCcw, Link as LinkIcon, FileText, Undo2, Loader2 } from 'lucide-react'
import type { ChatMessage, ProposedAction, EditOp } from '@/lib/chat/chat-types'

function actionLabel(a: ProposedAction): { label: string; icon: React.ReactNode } {
  if (a.type === 'reanalyze')     return { label: a.label ?? 'Re-analyse with these changes', icon: <RefreshCw size={12} /> }
  if (a.type === 'rescan_reanalyze') return { label: a.label ?? (a.all_pending ? 'Read all pending docs & re-populate' : `Read “${a.filename ?? 'document'}” & re-populate`), icon: <RefreshCw size={12} /> }
  if (a.type === 'draft_email')   return { label: a.label ?? 'Draft this in Engagement',       icon: <Mail size={12} /> }
  if (a.type === 'edit_analysis') return { label: a.label ?? 'Apply these edits',               icon: <PencilLine size={12} /> }
  return { label: a.label ?? 'Apply case change', icon: <PencilLine size={12} /> }
}

// Human-readable one-liner for a surgical edit op (the diff preview).
function opText(raw: EditOp): string {
  const op = raw as { target: string; op?: string; at?: number; match?: string; value?: Record<string, unknown>; set?: Record<string, unknown> }
  const where = op.at ? `#${op.at}` : op.match ? `“${op.match}”` : ''
  const noun: Record<string, string> = { next_steps: 'next step', scenarios: 'scenario', stakeholders: 'stakeholder', missing_items: 'missing item', blocking_issues: 'blocking issue', timeline: 'timeline event', open_questions: 'open question', quote_decision: 'quote decision' }
  if (op.target === 'brief') {
    const set = op.set ?? {}
    const bits = Object.keys(set).map(k => k === 'current_stage' ? `stage → “${set.current_stage}”` : k).filter(Boolean)
    return `Update brief: ${bits.join(', ')}`
  }
  if (op.target === 'quote_decision') {
    const line = (op as { line?: string }).line
    return `Update quote decision${line ? ` (${line})` : ''}`
  }
  const n = noun[op.target] ?? op.target
  if (op.op === 'add') {
    const label = (op.value?.action ?? op.value?.name ?? op.value?.item ?? op.value?.event ?? op.value?.question ?? op.value) as string
    return `Add ${n}: “${typeof label === 'string' ? label : JSON.stringify(label)}”`
  }
  if (op.op === 'remove') return `Remove ${n} ${where}`
  return `Update ${n} ${where}`
}

export function ChatMessageItem({ message, confirming, onConfirm, onUndo, onRegenerate }: { message: ChatMessage; confirming?: boolean; onConfirm: (m: ChatMessage) => void; onUndo?: (m: ChatMessage) => void; onRegenerate?: () => void }) {
  const isUser = message.role === 'user'
  const action = message.metadata_json?.action
  const done   = message.metadata_json?.action_done
  const citations = message.citations_json ?? []
  const streaming = message.message_status === 'streaming'

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      {!isUser && (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">
          <Sparkles size={10} className="text-primary" /> Consultant
        </span>
      )}
      {isUser && (message.metadata_json?.attachments?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[86%] justify-end">
          {message.metadata_json!.attachments!.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] rounded-md border border-[--border-subtle] bg-muted/50 px-1.5 py-0.5 text-muted-foreground/80">
              <FileText size={9} /> <span className="max-w-[130px] truncate">{f}</span>
            </span>
          ))}
        </div>
      )}
      <div className={cn(
        'max-w-[86%] rounded-2xl px-3 py-2 text-[12.5px] leading-[1.55] whitespace-pre-wrap break-words',
        isUser ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted/60 text-foreground rounded-bl-sm',
      )}>
        {streaming && !message.content ? (
          <span className="inline-flex gap-1 py-0.5" aria-label="Assistant is thinking">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        ) : (
          <>
            {message.content}
            {streaming && <span className="inline-block w-[2px] h-3.5 ml-0.5 align-middle bg-foreground/60 animate-pulse" />}
          </>
        )}
      </div>

      {citations.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[86%]">
          {citations.map((c, i) => (
            c.kind === 'email' && c.ref ? (
              <a key={i} href={`/engagement?lead=${c.ref}`}
                className="inline-flex items-center gap-1 text-[10px] rounded-[6px] border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-primary hover:bg-primary/10 transition-colors"
                title="Open the source conversation">
                <LinkIcon size={9} /> {c.label}
              </a>
            ) : (
              <span key={i} className="text-[10px] rounded-[6px] border border-[--border-subtle] bg-card px-1.5 py-0.5 text-muted-foreground/70">
                {c.label}
              </span>
            )
          ))}
        </div>
      )}

      {action && (
        done ? (
          message.metadata_json?.action_undone ? (
            <span className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground/60"><Undo2 size={11} /> Undone</span>
          ) : (action.type === 'edit_analysis' && message.metadata_json?.action_undo && onUndo) ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-600"><Check size={11} /> Applied</span>
              <button onClick={() => onUndo(message)} className="flex items-center gap-1 text-[10.5px] text-muted-foreground/60 hover:text-foreground transition-colors"><Undo2 size={10} /> Undo</button>
            </div>
          ) : (
            <span className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-600"><Check size={11} /> Done</span>
          )
        ) : (
          <div className="flex flex-col gap-1.5 max-w-[86%]">
            {action.type === 'edit_analysis' && action.ops?.length > 0 && (
              <div className="rounded-lg border border-[--border-subtle] bg-muted/30 px-2.5 py-2 flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground/55">Will change</span>
                <ul className="flex flex-col gap-0.5">
                  {action.ops.map((op, i) => (
                    <li key={i} className="text-[11px] text-foreground/75 flex gap-1.5"><span className="text-muted-foreground/40 mt-[1px]">•</span><span>{opText(op)}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => !confirming && onConfirm(message)}
              disabled={confirming}
              className="self-start flex items-center gap-1.5 text-[11px] font-semibold rounded-lg border border-primary/30 bg-primary/5 text-primary px-2.5 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-70"
            >
              {confirming ? <Loader2 size={12} className="animate-spin" /> : actionLabel(action).icon}
              {confirming ? 'Working…' : actionLabel(action).label}
            </button>
            {confirming && (action.type === 'reanalyze' || action.type === 'rescan_reanalyze') && (
              <span className="text-[10px] text-muted-foreground/60">Re-running the analysis — Mission Control will update. This can take a minute.</span>
            )}
          </div>
        )
      )}

      {onRegenerate && (
        <button onClick={onRegenerate}
          className="flex items-center gap-1 text-[10.5px] text-muted-foreground/60 hover:text-foreground transition-colors">
          <RotateCcw size={10} /> Regenerate
        </button>
      )}
    </div>
  )
}
