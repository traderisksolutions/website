import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EngagementThreadRow } from '@/components/engagement-agent/engagement-thread-row'
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

  it('renders subject as snippet', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText('Re: Marine insurance quotation')).toBeInTheDocument()
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

  it('shows needs-reply dot when last message is inbound', () => {
    render(<EngagementThreadRow lead={baseLead} isActive={false} threadState={inboundThread} onClick={vi.fn()} />)
    // The needs-reply dot is a span with specific background styling
    const btn = screen.getByRole('button')
    // Active border-l class changes when needs reply
    expect(btn.className).toContain('border-l-[--warning]')
  })

  it('shows campaign badge when campaign_context is present', () => {
    const campaignLead: Lead = {
      ...baseLead,
      campaign_context: {
        campaign_id: 'c1', campaign_name: 'Marine Oct', product_type: 'marine', step_replied_to: 1,
      },
    }
    render(<EngagementThreadRow lead={campaignLead} isActive={false} threadState={emptyThread} onClick={vi.fn()} />)
    expect(screen.getByText('C')).toBeInTheDocument()
  })
})
