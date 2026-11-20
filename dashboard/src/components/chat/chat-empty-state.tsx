'use client'

import React from 'react'
import { Sparkles, ScanSearch } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'

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
    'Move the next step “send documents to insurer” to Friday and assign it to Nathan.',
    'The client email is too long — rewrite it in half the words.',
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-5 gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles size={18} className="text-primary" />
      </div>
      <div>
        <p className="text-body font-semibold text-trs-ink">Your case consultant</p>
        <p className="text-small text-trs-muted mt-0.5 leading-[1.5]">
          Ask about this case, or tell me what to change — a next step, a deadline, the blocking issue, an email. I propose the exact change; you confirm it.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full mt-1">
        {/* Prominent proactive action */}
        <Btn onClick={() => onPick(GAP_REVIEW_PROMPT)} size="xs" className="justify-start text-left">
          <ScanSearch size={13} strokeWidth={2} className="flex-shrink-0" />
          Review this case for gaps
        </Btn>
        {prompts.map((p, i) => (
          <Btn key={i} onClick={() => onPick(p)} level="tertiary"
            className="h-auto justify-start whitespace-normal text-left text-small font-normal border-trs-line bg-white px-3 py-2 text-trs-ink-2 hover:border-trs-green">
            {p}
          </Btn>
        ))}
      </div>
    </div>
  )
}
