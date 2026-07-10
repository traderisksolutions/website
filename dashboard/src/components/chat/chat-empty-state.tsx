'use client'

import React from 'react'
import { Sparkles, ScanSearch } from 'lucide-react'

// Proactive gap review — Opus uses its read-tools to scan the whole case.
export const GAP_REVIEW_PROMPT =
  'Review this case for gaps and omissions. Use your tools to check the timeline, ' +
  'the next-steps roadmap, the stakeholders, and the attachments/documents, then list ' +
  'what is missing or stale — missing documents, unanswered questions, parties not yet ' +
  'contacted, next-steps without a recipient, and quotes not yet verified. Be specific and ' +
  'cite what you looked at. Then offer to fix each one.'

export function ChatEmptyState({ onPick }: { caseAware?: boolean; onPick: (prompt: string) => void }) {
  const prompts = [
    'What are the biggest risks on this case right now?',
    'The stage is wrong — we’re already in arbitration. Update the analysis.',
    'Re-analyse focusing only on the coverage dispute.',
    'Draft a firmer chase to the insurer.',
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-5 gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles size={18} className="text-primary" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-foreground">Your case consultant</p>
        <p className="text-[11.5px] text-muted-foreground/70 mt-0.5 leading-[1.5]">
          Ask about this case, tell me what to fix, or request changes. I’ll propose actions you confirm.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full mt-1">
        {/* Prominent proactive action */}
        <button onClick={() => onPick(GAP_REVIEW_PROMPT)}
          className="flex items-center gap-2 text-left text-[11.5px] font-semibold rounded-lg border border-primary/30 bg-primary/[0.07] px-3 py-2 text-primary hover:bg-primary/[0.12] transition-colors">
          <ScanSearch size={13} strokeWidth={2} className="flex-shrink-0" />
          Review this case for gaps
        </button>
        {prompts.map((p, i) => (
          <button key={i} onClick={() => onPick(p)}
            className="text-left text-[11.5px] rounded-lg border border-[--border-subtle] bg-card px-3 py-2 text-foreground/80 hover:border-primary/40 hover:bg-primary/5 transition-colors">
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
