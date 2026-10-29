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
    <div className="mt-2.5 px-3 py-2 rounded-[10px]" style={{ background: '#f1f2ee' }}>
      <p className="text-[12.5px] leading-[1.5] m-0" style={{ color: '#4a5550' }}>
        <span className="font-medium" style={{ color: '#2a332f' }}>Self-improving</span>
        {' — '}{parts.join(' · ')} informed this draft.
      </p>
    </div>
  )
}
