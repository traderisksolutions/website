import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EngagementMessageCard } from '@/components/engagement-agent/engagement-message-card'
import type { RealMsg } from '@/components/engagement/types'

// isomorphic-dompurify's jsdom fallback doesn't load under this repo's vitest/jsdom/undici
// combination (unrelated to this component — nothing here exercises body_html/sanitization),
// so stub it rather than let an unrelated import-time crash fail every test in this file.
vi.mock('@/lib/sanitize-email-html', () => ({ sanitizeEmailHtml: (html: string) => html }))

function makeMsg(overrides: Partial<RealMsg> = {}): RealMsg {
  return {
    id: 'msg-1',
    direction: 'inbound',
    from_address: 'client@example.com',
    subject: 'Renewal question',
    body_text: 'Hello, could you send the updated quote?',
    body_html: null,
    highlights: null,
    sent_at: '2026-08-01T10:00:00.000Z',
    to: ['broker@trade-risksol.com'],
    cc: [],
    ...overrides,
  }
}

describe('EngagementMessageCard', () => {
  it('collapsed state shows sender, a body preview, and a paperclip when attachments exist', () => {
    render(<EngagementMessageCard msg={makeMsg({ attachments: [{ id: 'a1', filename: 'quote.pdf', mime_type: 'application/pdf', size_bytes: 2048 }] })} defaultOpen={false} />)
    expect(screen.getByRole('button', { name: /expand message from/i })).toBeInTheDocument()
    expect(screen.getByText(/could you send the updated quote/i)).toBeInTheDocument()
  })

  it('clicking the collapsed row expands it and shows the full body + To metadata', () => {
    render(<EngagementMessageCard msg={makeMsg()} defaultOpen={false} />)
    fireEvent.click(screen.getByRole('button', { name: /expand message from/i }))
    expect(screen.getByRole('button', { name: /collapse message from/i })).toBeInTheDocument()
    expect(screen.getByText('broker@trade-risksol.com')).toBeInTheDocument()
  })

  it('clicking the expanded header collapses it back', () => {
    render(<EngagementMessageCard msg={makeMsg()} defaultOpen={true} />)
    fireEvent.click(screen.getByRole('button', { name: /collapse message from/i }))
    expect(screen.getByRole('button', { name: /expand message from/i })).toBeInTheDocument()
  })

  it('renders attachments inline below the body when expanded, with a download link per file', () => {
    const attachments = [
      { id: 'a1', filename: 'quote.pdf', mime_type: 'application/pdf', size_bytes: 2048 },
      { id: 'a2', filename: 'schedule.xlsx', mime_type: null, size_bytes: null },
    ]
    render(<EngagementMessageCard msg={makeMsg({ attachments })} defaultOpen={true} />)
    const link1 = screen.getByText('quote.pdf').closest('a')
    expect(link1).toHaveAttribute('href', '/api/engagement/attachments/a1/download')
    const link2 = screen.getByText('schedule.xlsx').closest('a')
    expect(link2).toHaveAttribute('href', '/api/engagement/attachments/a2/download')
  })

  it('renders no attachment row when the message has none', () => {
    render(<EngagementMessageCard msg={makeMsg({ attachments: [] })} defaultOpen={true} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('applies the active left-accent border only when isLatest is true', () => {
    const { container: latest } = render(<EngagementMessageCard msg={makeMsg()} defaultOpen={true} isLatest />)
    expect(latest.firstChild).toHaveClass('border-l-primary/40')

    const { container: older } = render(<EngagementMessageCard msg={makeMsg({ id: 'msg-2' })} defaultOpen={true} isLatest={false} />)
    expect(older.firstChild).toHaveClass('border-l-transparent')
  })
})
