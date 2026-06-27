import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvaluationSummary } from '@/components/engagement-agent/evaluation-summary'

describe('EvaluationSummary', () => {
  it('renders nothing when emailType is null', () => {
    const { container } = render(
      <EvaluationSummary emailType={null} examplesCount={2} watchOutsCount={1} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no examples or watchouts', () => {
    const { container } = render(
      <EvaluationSummary emailType="PRICING" examplesCount={0} watchOutsCount={0} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders "Self-improving" label when data is present', () => {
    render(
      <EvaluationSummary emailType="PRICING" examplesCount={2} watchOutsCount={1} />
    )
    expect(screen.getByText('Self-improving')).toBeInTheDocument()
  })

  it('shows approved patterns count', () => {
    render(
      <EvaluationSummary emailType="COVERAGE" examplesCount={2} watchOutsCount={0} />
    )
    expect(screen.getByText(/2 approved patterns/)).toBeInTheDocument()
  })

  it('uses singular for one example', () => {
    render(
      <EvaluationSummary emailType="RENEWAL" examplesCount={1} watchOutsCount={0} />
    )
    expect(screen.getByText(/1 approved pattern\b/)).toBeInTheDocument()
  })

  it('shows lesson count', () => {
    render(
      <EvaluationSummary emailType="CLAIMS" examplesCount={0} watchOutsCount={3} />
    )
    expect(screen.getByText(/3 lessons from past edits/)).toBeInTheDocument()
  })

  it('shows both signals joined by middot', () => {
    render(
      <EvaluationSummary emailType="PRICING" examplesCount={2} watchOutsCount={1} />
    )
    expect(screen.getByText(/2 approved patterns/)).toBeInTheDocument()
    expect(screen.getByText(/1 lesson from past edits/)).toBeInTheDocument()
  })
})
