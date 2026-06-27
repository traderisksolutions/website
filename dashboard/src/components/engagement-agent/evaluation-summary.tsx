'use client'

interface EvaluationSummaryProps {
  emailType:      string | null
  examplesCount:  number
  watchOutsCount: number
}

export function EvaluationSummary({ emailType, examplesCount, watchOutsCount }: EvaluationSummaryProps) {
  if (!emailType) return null
  const total = examplesCount + watchOutsCount
  if (total === 0) return null

  const parts: string[] = []
  if (examplesCount > 0) parts.push(`${examplesCount} approved pattern${examplesCount !== 1 ? 's' : ''}`)
  if (watchOutsCount > 0) parts.push(`${watchOutsCount} lesson${watchOutsCount !== 1 ? 's' : ''} from past edits`)

  return (
    <div className="mt-2 px-2 py-1.5 bg-primary/[.03] rounded-lg border border-primary/10">
      <p className="text-[9px] text-muted-foreground/60 leading-[1.5] m-0">
        <span className="font-semibold text-primary/60">Self-improving</span>
        {' — '}{parts.join(' · ')} informed this draft.
      </p>
    </div>
  )
}
