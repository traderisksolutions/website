'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RagSource } from '@/components/engagement/types'
import { RetrievalSourcesPanel } from './retrieval-sources-panel'
import { ApprovedExamplesPanel } from './approved-examples-panel'
import { AntiPatternPanel } from './anti-pattern-panel'

const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIR = '#e8eaed'

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
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center justify-between w-full text-left bg-transparent border-0 p-0 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium" style={{ color: BODY }}>How this draft was made</span>
          {!open && (
            <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
              {signalCount} signal{signalCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn('transition-transform flex-shrink-0', open && 'rotate-180')}
          style={{ color: DOT }}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-1 text-[12.5px]" style={{ color: MUTED }}>
          <RetrievalSourcesPanel sources={ragSources} gdocNames={gdocNames} generatedBy={generatedBy} />
          <ApprovedExamplesPanel examples={examples} />
          <AntiPatternPanel watchOuts={watchOuts} />
        </div>
      )}
    </div>
  )
}
