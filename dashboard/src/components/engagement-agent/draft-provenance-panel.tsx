'use client'

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RagSource } from '@/components/engagement/types'
import { RetrievalSourcesPanel } from './retrieval-sources-panel'
import { ApprovedExamplesPanel } from './approved-examples-panel'
import { AntiPatternPanel } from './anti-pattern-panel'

interface Example {
  id:              string
  context_summary: string | null
  ideal_reply:     string
  score:           number
}

interface DraftProvenancePanelProps {
  generatedBy: string | null
  ragSources:  RagSource[]
  gdocNames?:  string[]
  examples:    Example[]
  watchOuts:   string[]
}

export function DraftProvenancePanel({
  generatedBy, ragSources, gdocNames, examples, watchOuts,
}: DraftProvenancePanelProps) {
  const [open, setOpen] = useState(false)

  const hasKnowledge = ragSources.length > 0 || (gdocNames && gdocNames.length > 0) || generatedBy === 'gdrive'
  const signalCount  =
    (hasKnowledge ? 1 : 0) +
    (examples.length > 0 ? 1 : 0) +
    (watchOuts.length > 0 ? 1 : 0)

  if (signalCount === 0) return null

  return (
    <div className="mt-2.5 pt-2.5 border-t border-[--border-subtle]">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size={9} strokeWidth={2} className="text-primary/60" />
          <span className="text-[9.5px] font-semibold text-muted-foreground/70">How this draft was made</span>
          {!open && (
            <span className="text-[8.5px] text-muted-foreground/40 tabular-nums">
              {signalCount} signal{signalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown
          size={9}
          strokeWidth={2}
          className={cn('text-muted-foreground/40 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-1">
          <RetrievalSourcesPanel sources={ragSources} gdocNames={gdocNames} generatedBy={generatedBy} />
          <ApprovedExamplesPanel examples={examples} />
          <AntiPatternPanel watchOuts={watchOuts} />
        </div>
      )}
    </div>
  )
}
