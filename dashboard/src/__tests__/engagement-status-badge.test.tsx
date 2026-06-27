import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EngagementStatusBadge } from '@/components/engagement-agent/engagement-status-badge'

const STATUS_LABELS: Record<string, string> = {
  contacted: 'Contacted',
  engaged:   'Engaged',
  qualified: 'Qualified',
  proposal:  'Proposal',
  converted: 'Converted',
  dropped:   'Dropped',
}

describe('EngagementStatusBadge', () => {
  it.each(Object.entries(STATUS_LABELS))('renders "%s" as "%s"', (status, label) => {
    render(<EngagementStatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('falls back to "Contacted" for unknown status', () => {
    render(<EngagementStatusBadge status="unknown_xyz" />)
    expect(screen.getByText('Contacted')).toBeInTheDocument()
  })

  it('renders sm size by default', () => {
    render(<EngagementStatusBadge status="engaged" />)
    const el = screen.getByText('Engaged')
    expect(el.className).toContain('text-[10.5px]')
  })

  it('renders md size when specified', () => {
    render(<EngagementStatusBadge status="engaged" size="md" />)
    const el = screen.getByText('Engaged')
    expect(el.className).toContain('text-[11.5px]')
  })
})
