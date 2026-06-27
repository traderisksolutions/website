import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EngagementThreadHeader } from '@/components/engagement-agent/engagement-thread-header'
import type { Lead } from '@/components/engagement/types'

const baseLead: Lead = {
  id:           'lead-1',
  created_at:   '2025-01-01T10:00:00Z',
  source:       'website_form',
  first_name:   'Bob',
  last_name:    'Lim',
  email:        'bob@example.com',
  phone:        null,
  company:      'Sea Freight Ltd',
  department:   null,
  contact_type: null,
  topic:        null,
  details:      null,
  message:      null,
  page_url:     null,
  status:       'engaged',
}

const baseProps = {
  subject:       'Re: Marine cargo policy renewal',
  lead:          baseLead,
  messageCount:  4,
  needsReply:    false,
  statusKey:     'engaged',
  confirmDelete: false,
  deleting:      false,
  onDelete:      vi.fn(),
  onCancelDelete: vi.fn(),
}

describe('EngagementThreadHeader', () => {
  it('renders subject as main heading', () => {
    render(<EngagementThreadHeader {...baseProps} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Re: Marine cargo policy renewal')
  })

  it('falls back to contact name when no subject', () => {
    render(<EngagementThreadHeader {...baseProps} subject={null} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bob Lim')
  })

  it('renders message count badge', () => {
    render(<EngagementThreadHeader {...baseProps} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('does not render message count badge when 0', () => {
    render(<EngagementThreadHeader {...baseProps} messageCount={0} />)
    // Badge is only shown when messageCount > 0
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows "Awaiting reply" indicator when needsReply', () => {
    render(<EngagementThreadHeader {...baseProps} needsReply={true} />)
    expect(screen.getByText('Awaiting reply')).toBeInTheDocument()
  })

  it('does not show "Awaiting reply" when up to date', () => {
    render(<EngagementThreadHeader {...baseProps} needsReply={false} />)
    expect(screen.queryByText('Awaiting reply')).not.toBeInTheDocument()
  })

  it('renders status badge with correct status', () => {
    render(<EngagementThreadHeader {...baseProps} statusKey="qualified" />)
    expect(screen.getByText('Qualified')).toBeInTheDocument()
  })

  it('delete button has aria-label', () => {
    render(<EngagementThreadHeader {...baseProps} />)
    expect(screen.getByLabelText('Delete thread')).toBeInTheDocument()
  })

  it('enters confirm mode on first delete click', () => {
    render(<EngagementThreadHeader {...baseProps} />)
    const deleteBtn = screen.getByLabelText('Delete thread')
    fireEvent.click(deleteBtn)
    expect(baseProps.onDelete).toHaveBeenCalledOnce()
  })

  it('shows confirm/cancel when confirmDelete is true', () => {
    render(<EngagementThreadHeader {...baseProps} confirmDelete={true} />)
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onCancelDelete when cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<EngagementThreadHeader {...baseProps} confirmDelete={true} onCancelDelete={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
