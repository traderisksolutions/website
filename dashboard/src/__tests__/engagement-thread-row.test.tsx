import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EngagementThreadRow } from '@/components/engagement-agent/engagement-thread-row'
import { ThreadRow } from '@/components/engagement/ThreadRow'
import type { Lead, ThreadState } from '@/components/engagement/types'

const baseLead: Lead = {
  id:           'lead-1',
  created_at:   '2025-01-01T10:00:00Z',
  source:       'website_form',
  first_name:   'Alice',
  last_name:    'Tan',
  email:        'alice@acme.com',
  phone:        null,
  company:      'Acme Corp',
  department:   null,
  contact_type: null,
  topic:        'Marine cargo enquiry',
  details:      null,
  message:      null,
  page_url:     null,
  status:       'contacted',
  subject:      'Re: Marine insurance quotation',
}

const emptyThread: ThreadState = {
  loading: false, thread: null, messages: [], error: null,
}

const inboundThread: ThreadState = {
  loading: false,
  thread:  { id: 't1', subject: null, status: 'open', last_message_at: '2025-01-02T10:00:00Z', message_count: 3 },
  messages: [
    { id: 'm1', direction: 'inbound', from_address: 'alice@acme.com', subject: null, body_text: 'Hello', sent_at: '2025-01-02T10:00:00Z', to: [], cc: [] },
  ],
  error: null,
}

describe('EngagementThreadRow', () => {
  it('renders contact name', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText('Alice Tan')).toBeInTheDocument()
  })

  it('renders company name', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders company · subject on one line', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText(/Re: Marine insurance quotation/)).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('has aria-pressed=true when active', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={true} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has aria-pressed=false when inactive', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows an ink dot and "Needs your reply" when the last message is inbound', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={inboundThread} onClick={vi.fn()} />)
    const dot = screen.getByRole('button').querySelector('[data-dot]') as HTMLElement
    expect(dot.style.background).toBe('rgb(32, 33, 36)')
    expect(screen.getByText('Needs your reply')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', expect.stringContaining('needs your reply'))
  })

  it('keeps the dot transparent when nothing is awaited', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    const dot = screen.getByRole('button').querySelector('[data-dot]') as HTMLElement
    expect(dot.style.background).toBe('transparent')
  })

  it('uses no colour-coded state classes', () => {
    render(<EngagementThreadRow lead={{ ...baseLead, category: 'claim' }} isActive={false} threadState={inboundThread} onClick={vi.fn()} />)
    expect(screen.getByRole('button').outerHTML).not.toMatch(/amber|slate-|#0C338A|#0c338a|text-primary|bg-primary|--warning/)
    expect(screen.getByText('Needs your reply · Claim')).toBeInTheDocument()
  })

  it('writes "Campaign" in the state line when campaign_context is present', () => {
    const campaignLead: Lead = {
      ...baseLead,
      campaign_context: {
        campaign_id: 'c1', campaign_name: 'Marine Oct', product_type: 'marine', step_replied_to: 1,
      },
    }
    render(<EngagementThreadRow lead={campaignLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText('Campaign')).toBeInTheDocument()
  })

  describe('iconOnly (collapsed rail)', () => {
    it('renders just the avatar initial — no name, company, or subject text', () => {
      render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} iconOnly />)
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.queryByText('Alice Tan')).toBeNull()
      expect(screen.queryByText('Acme Corp')).toBeNull()
      expect(screen.queryByText('Re: Marine insurance quotation')).toBeNull()
    })

    it('still calls onClick and exposes the full name/subject via the title attribute', () => {
      const onClick = vi.fn()
      render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={onClick} iconOnly />)
      const btn = screen.getByRole('button')
      expect(btn).toHaveAttribute('title', expect.stringContaining('Alice Tan'))
      fireEvent.click(btn)
      expect(onClick).toHaveBeenCalledOnce()
    })

    it('still reflects active (field surface) and needs-reply (ink dot) state', () => {
      const { rerender } = render(<EngagementThreadRow lead={baseLead} isActive={true} threadState={emptyThread} onClick={vi.fn()} iconOnly />)
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button').className).toContain('bg-[#f1f3f4]')
      expect(screen.getByRole('button').querySelector('[data-dot]')).toBeNull()

      rerender(<EngagementThreadRow lead={baseLead} isActive={false} threadState={inboundThread} onClick={vi.fn()} iconOnly />)
      const dot = screen.getByRole('button').querySelector('[data-dot]') as HTMLElement
      expect(dot.style.background).toBe('rgb(32, 33, 36)')
    })
  })
})

// ── ThreadRow — the Unified Mail Navigator row ──────────────────────────────────────────────
// Grid row: ink dot only when a reply is needed, sender/time, `Company · subject`, one state line.

describe('ThreadRow (navigator)', () => {
  const dotOf = () => screen.getByRole('button').querySelector('[data-dot]') as HTMLElement

  it('renders sender, company and subject', () => {
    render(<ThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText('Alice Tan')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText(/Re: Marine insurance quotation/)).toBeInTheDocument()
  })

  it('shows an ink dot and "Needs your reply" when the last message is inbound', () => {
    render(<ThreadRow lead={baseLead} isActive={false} threadState={inboundThread} onClick={vi.fn()} />)
    expect(dotOf().style.background).toBe('rgb(32, 33, 36)')
    expect(screen.getByText('Needs your reply')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', expect.stringContaining('needs your reply'))
  })

  it('keeps the dot transparent and shows "Awaiting client" after we wrote last', () => {
    const outbound: ThreadState = { ...inboundThread, messages: [{ ...inboundThread.messages[0], direction: 'outbound' }] }
    render(<ThreadRow lead={baseLead} isActive={false} threadState={outbound} onClick={vi.fn()} />)
    expect(dotOf().style.background).toBe('transparent')
    expect(screen.getByText('Awaiting client')).toBeInTheDocument()
  })

  it('appends the triage type to the state line', () => {
    render(<ThreadRow lead={{ ...baseLead, category: 'renewal' }} isActive={false} threadState={inboundThread} onClick={vi.fn()} />)
    expect(screen.getByText('Needs your reply · Renewal')).toBeInTheDocument()
  })

  it('hides the state line in compact density', () => {
    render(<ThreadRow lead={baseLead} isActive={false} threadState={inboundThread} onClick={vi.fn()} density="compact" />)
    expect(screen.queryByText('Needs your reply')).toBeNull()
  })

  it('marks the selected row with aria-pressed and the field surface', () => {
    render(<ThreadRow lead={baseLead} isActive={true} threadState={emptyThread} onClick={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn.className).toContain('bg-[#f1f3f4]')
  })

  it('uses no colour-coded state classes', () => {
    render(<ThreadRow lead={baseLead} isActive={false} threadState={inboundThread} onClick={vi.fn()} />)
    expect(screen.getByRole('button').outerHTML).not.toMatch(/amber|slate-|#0C338A|#0c338a|text-primary|bg-primary/)
  })

  it('calls onClick', () => {
    const onClick = vi.fn()
    render(<ThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
