'use client'

import { useState } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Example {
  id:              string
  context_summary: string | null
  ideal_reply:     string
  score:           number
}

interface ApprovedExamplesPanelProps {
  examples: Example[]
}

export function ApprovedExamplesPanel({ examples }: ApprovedExamplesPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [openIdx,  setOpenIdx]  = useState<number | null>(null)

  if (examples.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <CheckCircle2 size={9} strokeWidth={2} className="text-[--success]" />
        <span>
          {examples.length} approved {examples.length === 1 ? 'pattern' : 'patterns'} available
        </span>
        <ChevronDown size={9} className={cn('transition-transform ml-0.5', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {examples.map((ex, i) => (
            <div key={ex.id} className="rounded-lg border border-[--border-subtle] bg-card overflow-hidden">
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-start gap-2 px-2.5 py-2 text-left hover:bg-accent/30 transition-colors"
              >
                <span className="text-[8px] font-bold text-[--success] bg-[--success]/10 px-1.5 py-[2px] rounded-full flex-shrink-0 mt-0.5">
                  {ex.score}/5
                </span>
                <p className="text-[9.5px] text-foreground/65 leading-[1.5] line-clamp-2 m-0 flex-1">
                  {ex.context_summary ?? ex.ideal_reply.slice(0, 80)}
                </p>
                <ChevronDown size={9} className={cn(
                  'flex-shrink-0 mt-0.5 text-muted-foreground/50 transition-transform',
                  openIdx === i && 'rotate-180',
                )} />
              </button>
              {openIdx === i && (
                <div className="px-2.5 pb-2.5 border-t border-[--border-subtle]">
                  <p className="text-[9.5px] text-muted-foreground/65 leading-[1.6] whitespace-pre-wrap m-0 pt-2 max-h-[100px] overflow-y-auto">
                    {ex.ideal_reply.slice(0, 300)}{ex.ideal_reply.length > 300 ? '…' : ''}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
