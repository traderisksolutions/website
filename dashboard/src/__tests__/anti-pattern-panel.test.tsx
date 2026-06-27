import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AntiPatternPanel } from '@/components/engagement-agent/anti-pattern-panel'

const WATCH_OUTS = [
  'Avoid quoting premiums without first confirming vessel details',
  'Do not promise a 2-day SLA for complex marine submissions',
]

describe('AntiPatternPanel', () => {
  it('renders nothing when watchOuts is empty', () => {
    const { container } = render(<AntiPatternPanel watchOuts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders singular label for one watch-out', () => {
    render(<AntiPatternPanel watchOuts={['One pattern']} />)
    expect(screen.getByText('1 watch-out applied')).toBeInTheDocument()
  })

  it('renders plural label for multiple watch-outs', () => {
    render(<AntiPatternPanel watchOuts={WATCH_OUTS} />)
    expect(screen.getByText('2 watch-outs applied')).toBeInTheDocument()
  })

  it('watchouts are hidden initially', () => {
    render(<AntiPatternPanel watchOuts={WATCH_OUTS} />)
    expect(screen.queryByText(WATCH_OUTS[0])).not.toBeInTheDocument()
  })

  it('shows watch-outs after clicking the toggle', () => {
    render(<AntiPatternPanel watchOuts={WATCH_OUTS} />)
    fireEvent.click(screen.getByText('2 watch-outs applied'))
    expect(screen.getByText(WATCH_OUTS[0])).toBeInTheDocument()
    expect(screen.getByText(WATCH_OUTS[1])).toBeInTheDocument()
  })

  it('hides watch-outs after clicking toggle twice', () => {
    render(<AntiPatternPanel watchOuts={WATCH_OUTS} />)
    const btn = screen.getByText('2 watch-outs applied')
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText(WATCH_OUTS[0])).not.toBeInTheDocument()
  })

  it('toggle button has aria-expanded attribute', () => {
    render(<AntiPatternPanel watchOuts={WATCH_OUTS} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})
