import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProspectsView } from '@/components/outreach/Prospects'
import { CampaignQueue } from '@/components/outreach/CampaignQueue'

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

const now = new Date().toISOString()
const prospects = {
  ready: true,
  campaigns: [{ id: 'c1', name: 'Benefits review SG', status: 'active' }],
  accounts: [{ id: 'a1', market: 'SG', name: 'Acme Logistics', domain: 'acme.sg', website: 'acme.sg', industry: 'Logistics', size: null, city: null, source: 'grok', source_url: null, notes: null, created_at: now }],
  contacts: [
    { id: 'p1', account_id: 'a1', full_name: 'Tan Wei Ming', first_name: 'Wei Ming', title: 'CFO', email: 'wm@acme.sg', email_status: 'verified', email_source_url: null, phone: '+65 9123 4567', linkedin_url: null, source: 'grok', do_not_contact: false, outbound_lead_id: null, created_at: now, enrolments: [] },
    { id: 'p2', account_id: 'a1', full_name: 'Desk', first_name: null, title: null, email: 'info@acme.sg', email_status: 'published', email_source_url: null, phone: null, linkedin_url: null, source: 'grok', do_not_contact: false, outbound_lead_id: 'l2', created_at: '2026-01-01T00:00:00Z', enrolments: [{ campaignId: 'c1', campaignName: 'Benefits review SG', approval: 'pending', send: 'unsent' }] },
  ],
}
const queue = {
  ready: true, stepsApproved: 2, nextRun: '2026-10-08T23:15:00.000Z',
  campaign: { id: 'c1', name: 'Benefits review SG', status: 'active', audience: { markets: ['SG'], emailStatuses: ['verified'] }, dailyNew: 5, autoApprove: false, bouncePausedAt: null },
  rows: [
    { id: 'r1', leadId: 'l1', name: 'Tan Wei Ming', company: 'Acme Logistics', email: 'wm@acme.sg', title: 'CFO', approval: 'pending', send: 'unsent', step: 0, totalSteps: 2, scheduledAt: null, lastSentAt: null, preview: { step: 1, subject: 'Acme Logistics benefits', body: 'Hi Wei Ming,' } },
    { id: 'r2', leadId: 'l3', name: 'Jane Ong', company: 'Acme Logistics', email: 'jane@acme.sg', title: null, approval: 'included', send: 'queued', step: 0, totalSteps: 2, scheduledAt: now, lastSentAt: null, preview: { step: 1, subject: 'Acme Logistics benefits', body: 'Hi Jane,' } },
  ],
}
const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = init?.method === 'POST' ? (String(url).includes('queue') ? { approved: 1 } : { enrolled: 1, skipped: 0, alreadyIn: 0, approved: 0 }) : String(url).includes('queue') ? queue : prospects
    return { ok: true, status: 200, json: async () => body } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
})

describe('ProspectsView', () => {
  it('lists people, marks role inboxes, filters, enrols the selection', async () => {
    const onNotice = vi.fn()
    render(<ProspectsView needle="" onNotice={onNotice} />)
    expect(await screen.findByText('Tan Wei Ming')).toBeInTheDocument()
    expect(screen.getByText('Role inbox, not sent')).toBeInTheDocument()
    expect(screen.getByText('Benefits review SG, awaiting review')).toBeInTheDocument()
    expect(screen.getByText('2 people at 1 company')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ready to email/ }))
    expect(screen.getByText('1 person at 1 company')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Select Tan Wei Ming'))
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 for review' }))
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('1 added to Benefits review SG for review.'))
    expect(JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1].body)).toEqual({ campaignId: 'c1', contactIds: ['p1'] })
  })
  it('opens the company with a WhatsApp link for mobiles', async () => {
    render(<ProspectsView needle="" onNotice={() => {}} />)
    fireEvent.click(await screen.findByText('Tan Wei Ming'))
    const wa = screen.getByRole('link', { name: 'WhatsApp' })
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/6591234567\?text=Hi%20Wei%20Ming/)
  })
  it('says when the migration is missing', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ ready: false, accounts: [], contacts: [], campaigns: [] }) }))
    render(<ProspectsView needle="" onNotice={() => {}} />)
    expect(await screen.findByText(/Apply supabase\/migrations\/20261008_prospects.sql/)).toBeInTheDocument()
  })
})

describe('CampaignQueue', () => {
  it('shows pending with a rendered preview and approves one', async () => {
    render(<CampaignQueue campaignId="c1" />)
    expect(await screen.findByText('Tan Wei Ming')).toBeInTheDocument()
    expect(screen.queryByText('Jane Ong')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('Hi Wei Ming,')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.getByText('Tan Wei Ming approved and queued.')).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1].body)).toEqual({ action: 'approve', ids: ['r1'] })
  })
  it('queued tab shows the scheduled step', async () => {
    render(<CampaignQueue campaignId="c1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Queued/ }))
    expect(screen.getByText('Jane Ong')).toBeInTheDocument()
    expect(screen.getByText(/^Email 1 of 2 from /)).toBeInTheDocument()
  })
  it('saves the daily top-up', async () => {
    render(<CampaignQueue campaignId="c1" />)
    fireEvent.change(await screen.findByLabelText('New per day'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save top-up' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(c => c[1]?.method === 'POST')).toBe(true))
    expect(JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1].body)).toEqual({ action: 'settings', markets: ['SG'], emailStatuses: ['verified'], dailyNew: 10, autoApprove: false })
  })
})
