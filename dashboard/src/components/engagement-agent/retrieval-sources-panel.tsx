'use client'

import { useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'
import type { RagSource } from '@/components/engagement/types'

interface RetrievalSourcesPanelProps {
  sources:     RagSource[]
  gdocNames?:  string[]
  generatedBy: string | null
}

export function RetrievalSourcesPanel({ sources, gdocNames, generatedBy }: RetrievalSourcesPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const hasRag           = generatedBy === 'rag' && sources.length > 0
  const hasGdriveDetails = generatedBy === 'gdrive' && !!gdocNames && gdocNames.length > 0
  const hasGdriveGeneric = generatedBy === 'gdrive' && (!gdocNames || gdocNames.length === 0)

  if (!hasRag && !hasGdriveDetails && !hasGdriveGeneric) return null

  // Deduplicate RAG sources by file_name
  const uniqueSources = hasRag
    ? sources.filter((s, i, arr) => arr.findIndex(x => x.file_name === s.file_name) === i)
    : []

  const label = hasRag
    ? `${uniqueSources.length} knowledge ${uniqueSources.length === 1 ? 'source' : 'sources'} retrieved`
    : gdocNames?.length
      ? `${gdocNames.length} knowledge ${gdocNames.length === 1 ? 'doc' : 'docs'} searched`
      : 'Knowledge base searched'

  // Only show expand chevron when there's something to reveal
  const canExpand = hasRag || hasGdriveDetails

  return (
    <div className="mt-2">
      {canExpand ? (
        <Btn
          level="tertiary"
          size="xs"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="h-auto px-0 py-0 border-0 text-small hover:bg-transparent"
        >
          <FileText size={9} strokeWidth={2} />
          <span>{label}</span>
          <ChevronDown size={9} className={cn('transition-transform ml-0.5', expanded && 'rotate-180')} />
        </Btn>
      ) : (
        <div className="flex items-center gap-1.5 text-small text-trs-muted">
          <FileText size={9} strokeWidth={2} />
          <span>{label}</span>
        </div>
      )}

      {expanded && hasRag && (
        <div className="mt-1.5 flex flex-col gap-1">
          {uniqueSources.map(s => (
            <div key={s.file_name} className="flex items-start gap-1.5 px-2 py-1.5 bg-trs-field rounded">
              <FileText size={9} strokeWidth={2} className="text-trs-subtle mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-small text-trs-muted truncate m-0 leading-snug">
                  {s.file_name}
                </p>
                <p className="text-small text-trs-subtle m-0">
                  {Math.round(s.similarity * 100)}% match
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && hasGdriveDetails && gdocNames && (
        <div className="mt-1.5 flex flex-col gap-1">
          {gdocNames.map((name, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 bg-trs-field rounded">
              <FileText size={9} strokeWidth={2} className="text-trs-subtle flex-shrink-0" />
              <p className="text-small text-trs-muted truncate m-0">{name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
