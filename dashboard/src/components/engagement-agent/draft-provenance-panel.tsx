'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'
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
    <div className="mt-3 pt-3 border-t border-trs-line">
      <Btn
        level="tertiary"
        size="xs"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="justify-between w-full h-auto text-left bg-transparent border-0 p-0 font-normal hover:bg-transparent"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-small font-medium text-trs-ink-2">How this draft was made</span>
          {!open && (
            <span className="text-small tabular-nums text-trs-subtle">
              {signalCount} signal{signalCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn('transition-transform flex-shrink-0 text-trs-subtle', open && 'rotate-180')}
          aria-hidden
        />
      </Btn>

      {open && (
        <div className="mt-1 text-small text-trs-muted">
          <RetrievalSourcesPanel sources={ragSources} gdocNames={gdocNames} generatedBy={generatedBy} />
          <ApprovedExamplesPanel examples={examples} />
          <AntiPatternPanel watchOuts={watchOuts} />
        </div>
      )}
    </div>
  )
}
