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
    <div className="mt-2.5 px-3 py-2 rounded bg-trs-field">
      <p className="text-small leading-[1.5] m-0 text-trs-muted">
        <span className="font-medium text-trs-ink-2">Self-improving</span>
        {' — '}{parts.join(' · ')} informed this draft.
      </p>
    </div>
  )
}
