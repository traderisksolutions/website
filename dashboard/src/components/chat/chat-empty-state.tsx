'use client'

import React from 'react'
import { Sparkles } from 'lucide-react'

export function ChatEmptyState({ caseAware, onPick }: { caseAware: boolean; onPick: (prompt: string) => void }) {
  const prompts = caseAware
    ? [
        'What are the biggest risks on this case right now?',
        'The stage is wrong — we’re already in arbitration. Update the analysis.',
        'Re-analyse focusing only on the coverage dispute.',
        'Draft a firmer chase to the insurer.',
      ]
    : [
        'Summarise what needs my attention today.',
        'Help me draft a professional email.',
        'Explain a coverage concept in plain language.',
      ]

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-5 gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles size={18} className="text-primary" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-foreground">Your case consultant</p>
        <p className="text-[11.5px] text-muted-foreground/70 mt-0.5 leading-[1.5]">
          {caseAware
            ? 'Ask about this case, tell me what to fix, or request changes. I’ll propose actions you confirm.'
            : 'Ask anything, or open a case to steer its analysis.'}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full mt-1">
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
