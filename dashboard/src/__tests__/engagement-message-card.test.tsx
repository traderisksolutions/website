import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageBlock, splitQuotedChain, splitQuotedTextChain, wrapTables } from '@/components/engagement/MessageBlock'
import type { RealMsg } from '@/components/engagement/types'

// isomorphic-dompurify's jsdom fallback doesn't load under this repo's vitest/jsdom/undici
// combination, so sanitisation is stubbed; nothing here tests DOMPurify itself.
vi.mock('@/lib/sanitize-email-html', () => ({ sanitizeEmailHtml: (html: string) => html }))

function makeMsg(overrides: Partial<RealMsg> = {}): RealMsg {
  return {
    id: 'msg-1',
    direction: 'inbound',
    from_address: 'Lily Cheng <lcheng@sompo-intl.com>',
    subject: 'Renewal question',
    body_text: 'Hello, could you send the updated quote?',
    body_html: null,
    highlights: null,
    sent_at: '2026-08-01T10:00:00.000Z',
    to: ['hasya@trade-risksol.com'],
    cc: ['holim@sompo-intl.com'],
    ...overrides,
  }
}

const GMAIL_CHAIN = `<div dir="ltr"><p>Dear Hasya,</p><p>We regret to inform you that shipment of cars is not within our appetite.</p></div>
<div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Thu, 25 Sept 2026 at 11:02, Hasya Mohamed &lt;hasya@trade-risksol.com&gt; wrote:<br></div>
<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex"><p>Hi Lily, sharing the AV382 declaration for your review.</p>
<div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Wed, 24 Sept 2026 at 16:40, Cheng, Lily &lt;lcheng@sompo-intl.com&gt; wrote:<br></div>
<blockquote class="gmail_quote"><p>Received with thanks, will revert after underwriting review.</p></blockquote></div></blockquote></div>`

describe('MessageBlock', () => {
  it('renders the latest message in full: avatar initial, name, recipients, time, body', () => {
    render(<MessageBlock msg={makeMsg()} defaultOpen isLatest />)
    expect(screen.getByText('Lily Cheng')).toBeInTheDocument()
    expect(screen.getByText(/to hasya@trade-risksol.com/)).toBeInTheDocument()
    expect(screen.getByText(/could you send the updated quote/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /expand message/i })).toBeNull()
  })

  it('Details toggles the full recipient list', () => {
    render(<MessageBlock msg={makeMsg()} defaultOpen isLatest />)
    expect(screen.queryByText('holim@sompo-intl.com')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('holim@sompo-intl.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()
  })

  it('an earlier message is a one-line row that opens in place', () => {
    render(<MessageBlock msg={makeMsg({ attachments: [{ id: 'a1', filename: 'quote.pdf', mime_type: 'application/pdf', size_bytes: 2048 }] })} defaultOpen={false} />)
    const row = screen.getByRole('button', { name: /expand message from lily cheng/i })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/could you send the updated quote/)).toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.getByRole('button', { name: /collapse message from lily cheng/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/to hasya@trade-risksol.com · cc holim@sompo-intl.com · 1 attachment/)).toBeInTheDocument()
  })

  it('renders attachments as document cards with Preview and Download', () => {
    const attachments = [
      { id: 'a1', filename: 'AV382_Cargo_Declaration.pdf', mime_type: 'application/pdf', size_bytes: 1258291 },
      { id: 'a2', filename: 'Shipment_Schedule.xlsx', mime_type: null, size_bytes: null },
    ]
    render(<MessageBlock msg={makeMsg({ attachments })} defaultOpen isLatest />)
    expect(screen.getByText(/Attachments/)).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.getByText('XLSX')).toBeInTheDocument()
    expect(screen.getByText('1.2 MB')).toBeInTheDocument()
    const previews = screen.getAllByRole('link', { name: 'Preview' })
    expect(previews[0]).toHaveAttribute('href', '/api/engagement/attachments/a1/download')
    expect(previews[0]).toHaveAttribute('target', '_blank')
    const downloads = screen.getAllByRole('link', { name: 'Download' })
    expect(downloads[1]).toHaveAttribute('href', '/api/engagement/attachments/a2/download')
    expect(screen.queryByText('Save to company')).toBeNull()
  })

  it('folds the quoted history behind one row with the count, and opens it nested', () => {
    render(<MessageBlock msg={makeMsg({ body_html: GMAIL_CHAIN })} defaultOpen isLatest />)
    expect(screen.getByText(/We regret to inform you/)).toBeInTheDocument()
    expect(screen.queryByText(/sharing the AV382 declaration/)).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Show quoted history (2)' })
    fireEvent.click(toggle)
    expect(screen.getByText(/sharing the AV382 declaration/)).toBeInTheDocument()
    expect(screen.getByText('Hasya Mohamed')).toBeInTheDocument()
    expect(screen.getByText('Cheng, Lily')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide quoted history' })).toBeInTheDocument()
  })

  it('"View original" is always reachable and opens the raw message', () => {
    render(<MessageBlock msg={makeMsg({ body_html: '<p>Plain <b>note</b></p>', body_text: 'Plain note' })} defaultOpen isLatest />)
    fireEvent.click(screen.getByRole('button', { name: 'View original' }))
    expect(screen.getByRole('dialog', { name: 'Original message' })).toBeInTheDocument()
  })
})

describe('splitQuotedChain', () => {
  it('returns the nested chain in order with the attribution parsed', () => {
    const chain = splitQuotedChain(GMAIL_CHAIN)
    expect(chain).toHaveLength(2)
    expect(chain[0].name).toBe('Hasya Mohamed')
    expect(chain[0].date).toBe('Thu, 25 Sept 2026 at 11:02')
    expect(chain[0].html).toContain('sharing the AV382 declaration')
    expect(chain[0].html).not.toContain('Received with thanks')
    expect(chain[1].name).toBe('Cheng, Lily')
    expect(chain[1].html).toContain('Received with thanks')
  })

  it('reads an Outlook "From: … Sent: …" header', () => {
    const html = `<div><p>Thanks, noted. We will come back with terms by Friday.</p></div><div id="divRplyFwdMsg"><b>From:</b> Hasya Mohamed &lt;hasya@trade-risksol.com&gt;<br><b>Sent:</b> Thursday, 25 September 2026 11:02<br><b>To:</b> Lily<br><b>Subject:</b> AV382<br></div><div><p>Please find the declaration attached.</p></div>`
    const chain = splitQuotedChain(html)
    expect(chain).toHaveLength(1)
    expect(chain[0].name).toBe('Hasya Mohamed')
    expect(chain[0].date).toBe('Thursday, 25 September 2026 11:02')
    expect(chain[0].html).toContain('Please find the declaration attached')
    expect(chain[0].html).not.toContain('Subject:')
  })

  it('returns an empty chain when nothing is quoted', () => {
    expect(splitQuotedChain('<p>Just a note</p>')).toEqual([])
  })

  it('handles plain text with "On … wrote:" and ">" lines', () => {
    const text = 'Thanks.\n\nOn Thu, 25 Sept 2026, Hasya Mohamed <hasya@trade-risksol.com> wrote:\n> Hi Lily, sharing the declaration.\n>\n> On Wed, 24 Sept 2026, Cheng, Lily <lcheng@sompo-intl.com> wrote:\n> > Received with thanks.'
    const chain = splitQuotedTextChain(text)
    expect(chain).toHaveLength(2)
    expect(chain[0].name).toBe('Hasya Mohamed')
    expect(chain[0].html).toContain('sharing the declaration')
    expect(chain[1].html).toContain('Received with thanks')
  })
})

describe('wrapTables', () => {
  it('wraps a data table in the hairline container with the caption and leaves layout tables alone', () => {
    const data = '<table><tr><th>Item</th><th>Sum</th></tr><tr><td>Cargo</td><td>SGD 1,860,000</td></tr></table>'
    const out = wrapTables(`<p>Hi</p>${data}<p>Bye</p>`)
    expect(out).toContain('class="email-tbl"')
    expect(out).toContain('Table kept exactly as sent')
    expect(out).toContain('data-action="view-original"')
    const layout = '<table><tr><td><p>Whole message in one cell</p></td></tr></table>'
    expect(wrapTables(layout)).toBe(layout)
    const nested = `<table><tr><td>a</td><td>b</td></tr><tr><td>${data}</td><td>c</td></tr></table>`
    expect(wrapTables(nested)).not.toContain('email-tbl')
  })
})
