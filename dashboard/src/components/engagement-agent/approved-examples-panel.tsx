'use client'

import { useState } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'

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
      <Btn
        level="tertiary"
        size="xs"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="h-auto px-0 py-0 border-0 text-small hover:bg-transparent"
      >
        <CheckCircle2 size={9} strokeWidth={2} className="text-trs-ink-2" />
        <span>
          {examples.length} approved {examples.length === 1 ? 'pattern' : 'patterns'} available
        </span>
        <ChevronDown size={9} className={cn('transition-transform ml-0.5', expanded && 'rotate-180')} />
      </Btn>

      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {examples.map((ex, i) => (
            <div key={ex.id} className="rounded border border-trs-line bg-white overflow-hidden">
              <Btn
                level="tertiary"
                size="xs"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full h-auto justify-start items-start gap-2 px-2.5 py-2 text-left whitespace-normal border-0 rounded-none font-normal"
              >
                <span className="text-small font-semibold text-trs-ink-2 bg-trs-field px-1.5 py-[2px] rounded flex-shrink-0 mt-0.5">
                  {ex.score}/5
                </span>
                <p className="text-small text-trs-muted leading-[1.5] line-clamp-2 m-0 flex-1">
                  {ex.context_summary ?? ex.ideal_reply.slice(0, 80)}
                </p>
                <ChevronDown size={9} className={cn(
                  'flex-shrink-0 mt-0.5 text-trs-subtle transition-transform',
                  openIdx === i && 'rotate-180',
                )} />
              </Btn>
              {openIdx === i && (
                <div className="px-2.5 pb-2.5 border-t border-trs-line">
                  <p className="text-small text-trs-muted leading-[1.6] whitespace-pre-wrap m-0 pt-2 max-h-24 overflow-y-auto">
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
