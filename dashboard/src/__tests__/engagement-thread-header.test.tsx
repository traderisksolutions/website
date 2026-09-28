import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThreadHeader } from '@/components/engagement/ThreadHeader'
import type { Lead } from '@/components/engagement/types'

// The "Link company" popover reads the page's link handler from EngagementNavProvider; the header
// renders outside the provider here.
vi.mock('@/providers/engagement-nav-provider', () => ({ useEngagementNav: () => ({ onLinkCompany: vi.fn() }) }))

const baseLead: Lead = {
  id:           'lead-1',
  created_at:   '2025-01-01T10:00:00Z',
  source:       'thread',
  first_name:   'Lily',
  last_name:    'Cheng',
  email:        'lcheng@sompo-intl.com',
  phone:        null,
  company:      null,
  department:   null,
  contact_type: null,
  topic:        null,
  details:      null,
  message:      null,
  page_url:     null,
  status:       'engaged',
  category:     'rfq',
  companyId:    'co-1',
  companyName:  'Sompo',
}

function props(over: Partial<Parameters<typeof ThreadHeader>[0]> = {}) {
  return {
    subject:         'RE: (TRS) Sompo — AAS AV382 Cargo Insurance',
    lead:            baseLead,
    needsReply:      true,
    lastDirection:   'inbound' as const,
    ownerName:       'Hasya Mohamed',
    onReply:         vi.fn(),
    onReplyAll:      vi.fn(),
    onAddTask:       vi.fn(),
    onDelete:        vi.fn(),
    deleting:        false,
    contextOpen:     false,
    onToggleContext: vi.fn(),
    ...over,
  }
}

describe('ThreadHeader', () => {
  it('renders the subject as the heading and the contact with a faint email', () => {
    render(<ThreadHeader {...props()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RE: (TRS) Sompo — AAS AV382 Cargo Insurance')
    expect(screen.getByText('Lily Cheng')).toBeInTheDocument()
    expect(screen.getByText('· lcheng@sompo-intl.com')).toBeInTheDocument()
  })

  it('falls back to the contact name when there is no subject', () => {
    render(<ThreadHeader {...props({ subject: null })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lily Cheng')
  })

  it('writes the context line in words: company link, type, state, owner', () => {
    render(<ThreadHeader {...props()} />)
    expect(screen.getByRole('link', { name: 'Sompo' })).toHaveAttribute('href', '/companies?company=co-1')
    expect(screen.getByText('Quotation request')).toBeInTheDocument()
    expect(screen.getByText('Awaiting your reply')).toBeInTheDocument()
    expect(screen.getByText('Owner Hasya Mohamed')).toBeInTheDocument()
  })

  it('says "Awaiting client reply" after an outbound message and nothing when unknown', () => {
    const { rerender } = render(<ThreadHeader {...props({ needsReply: false, lastDirection: 'outbound' })} />)
    expect(screen.getByText('Awaiting client reply')).toBeInTheDocument()
    rerender(<ThreadHeader {...props({ needsReply: false, lastDirection: null })} />)
    expect(screen.queryByText(/Awaiting/)).toBeNull()
  })

  it('offers "Link company" when the thread is not linked', () => {
    render(<ThreadHeader {...props({ lead: { ...baseLead, companyId: null, companyName: null } })} />)
    expect(screen.getByText('Not linked to a company')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link company' })).toBeInTheDocument()
  })

  it('has no coloured state dot and no navy', () => {
    const { container } = render(<ThreadHeader {...props()} />)
    expect(container.innerHTML).not.toMatch(/#0C338A|slate-|#8a5a00/i)
  })

  it('Reply is the one filled button; Reply all, Context and More are labelled icon buttons', () => {
    const p = props()
    render(<ThreadHeader {...p} />)
    fireEvent.click(screen.getByRole('button', { name: /^Reply$/ }))
    expect(p.onReply).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Reply all' }))
    expect(p.onReplyAll).toHaveBeenCalledOnce()
    const ctx = screen.getByRole('button', { name: 'Context rail' })
    expect(ctx).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(ctx)
    expect(p.onToggleContext).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('title', 'More actions')
    expect(screen.queryByRole('button', { name: 'Forward' })).toBeNull()
  })

  it('More holds Add to-do, Open company page and a confirmed Delete', async () => {
    const p = props({ onDelete: vi.fn().mockResolvedValue(undefined) })
    render(<ThreadHeader {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open company page' })).toHaveAttribute('href', '/companies?company=co-1')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to-do' }))
    expect(p.onAddTask).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete thread' }))
    expect(screen.getByText('Delete this thread?')).toBeInTheDocument()
    expect(p.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(p.onDelete).toHaveBeenCalledOnce()
  })

  it('Escape closes the More menu', () => {
    render(<ThreadHeader {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
