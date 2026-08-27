import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EngagementDock } from '@/components/engagement/EngagementDock'

function setup() {
  return render(
    <EngagementDock
      analysis={<div>Analysis panel content</div>}
      rfq={<div>RFQ panel content</div>}
      gbquote={<div>Pricing panel content</div>}
    />,
  )
}

describe('EngagementDock', () => {
  it('renders exactly the three non-reply tabs', () => {
    setup()
    expect(screen.getByRole('button', { name: 'AI Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'RFQ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pricing Quote' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  })

  it('is collapsed by default (no panel content visible)', () => {
    setup()
    expect(screen.queryByText('Analysis panel content')).toBeNull()
  })

  it('clicking a tab opens its panel', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'RFQ' }))
    const panel = screen.getByText('RFQ panel content').parentElement
    expect(panel).not.toHaveClass('hidden')
  })

  it('clicking the active tab again collapses the dock', () => {
    setup()
    const rfqTab = screen.getByRole('button', { name: 'RFQ' })
    fireEvent.click(rfqTab)
    expect(screen.getByText('RFQ panel content').parentElement).not.toHaveClass('hidden')
    fireEvent.click(rfqTab)
    expect(screen.getByText('RFQ panel content').parentElement).toHaveClass('hidden')
  })

  it('keeps a previously-opened panel mounted (hidden, not removed) after switching tabs', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'RFQ' }))
    fireEvent.click(screen.getByRole('button', { name: 'AI Analysis' }))
    // RFQ content should still be in the DOM (mount-once/hide-with-CSS), just hidden via class.
    expect(screen.getByText('RFQ panel content').parentElement).toHaveClass('hidden')
    expect(screen.getByText('Analysis panel content').parentElement).not.toHaveClass('hidden')
  })
})
