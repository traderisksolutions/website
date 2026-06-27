'use client'

import { useState } from 'react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AntiPatternPanelProps {
  watchOuts: string[]
}

export function AntiPatternPanel({ watchOuts }: AntiPatternPanelProps) {
  const [expanded, setExpanded] = useState(false)

  if (watchOuts.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <AlertTriangle size={9} strokeWidth={2} className="text-[--warning]" />
        <span>
          {watchOuts.length} watch-{watchOuts.length === 1 ? 'out' : 'outs'} applied
        </span>
        <ChevronDown size={9} className={cn('transition-transform ml-0.5', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <ul className="mt-1.5 flex flex-col gap-1 m-0 pl-0 list-none">
          {watchOuts.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 px-2 py-1.5 bg-[--warning-bg]/60 rounded-lg">
              <span className="w-[4px] h-[4px] rounded-full bg-[--warning] flex-shrink-0 mt-[5px]" />
              <p className="text-[9.5px] text-foreground/65 leading-[1.5] m-0">{w}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
