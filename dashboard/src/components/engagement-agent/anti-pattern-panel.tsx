'use client'

import { useState } from 'react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'

interface AntiPatternPanelProps {
  watchOuts: string[]
}

export function AntiPatternPanel({ watchOuts }: AntiPatternPanelProps) {
  const [expanded, setExpanded] = useState(false)

  if (watchOuts.length === 0) return null

  return (
    <div className="mt-2">
      <Btn
        level="tertiary"
        size="xs"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="h-auto px-0 py-0 border-0 text-small hover:bg-transparent"
      >
        <AlertTriangle size={9} strokeWidth={2} className="text-trs-ink-2" />
        <span>
          {watchOuts.length} watch-{watchOuts.length === 1 ? 'out' : 'outs'} applied
        </span>
        <ChevronDown size={9} className={cn('transition-transform ml-0.5', expanded && 'rotate-180')} />
      </Btn>

      {expanded && (
        <ul className="mt-1.5 flex flex-col gap-1 m-0 pl-0 list-none">
          {watchOuts.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 px-2 py-1.5 bg-trs-field rounded">
              <span className="w-1 h-1 rounded-full bg-trs-ink-2 flex-shrink-0 mt-[5px]" />
              <p className="text-small text-trs-muted leading-[1.5] m-0">{w}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
