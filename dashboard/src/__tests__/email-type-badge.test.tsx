import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmailTypeBadge } from '@/components/engagement-agent/email-type-badge'

const TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const

describe('EmailTypeBadge', () => {
  it.each(TYPES)('renders label for %s', (type) => {
    render(<EmailTypeBadge type={type} />)
    // EMAIL_TYPE_MAP converts e.g. PRICING → "Pricing"
    const label = type.charAt(0) + type.slice(1).toLowerCase()
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('renders nothing for null type', () => {
    const { container } = render(<EmailTypeBadge type={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for unknown type', () => {
    const { container } = render(<EmailTypeBadge type="UNKNOWN" />)
    expect(container.firstChild).toBeNull()
  })

  it('applies correct inline color for PRICING', () => {
    render(<EmailTypeBadge type="PRICING" />)
    const badge = screen.getByText('Pricing')
    expect(badge).toHaveStyle({ color: '#1d4ed8' })
  })

  it('applies correct inline color for CLAIMS', () => {
    render(<EmailTypeBadge type="CLAIMS" />)
    const badge = screen.getByText('Claims')
    expect(badge).toHaveStyle({ color: '#dc2626' })
  })
})
