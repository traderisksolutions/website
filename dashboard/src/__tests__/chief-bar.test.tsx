/**
 * The next-actions bar: the timer it shows, a draft opened on the page, and a new enquiry that goes
 * out as one email per insurer, each with one address in To and no insurer on copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ChiefBar } from '@/components/engagement/ChiefBar'
import type { Bar } from '@/lib/chief/bar'

const base: Bar = {
  threadId: 't1', companyId: 'c1', today: '2026-11-06', autoReply: null, drafts: [], enquiry: null, caseItem: null, hold: null,
  state: { kind: 'waiting', person: 'Serene Tan', email: 'serene@client.example', side: 'client', sentAt: '2026-11-06T04:29:00Z', chaseDue: '2026-11-13', workingDaysLeft: 4, overdue: false, snoozed: false },
}
const enquiry: Bar['enquiry'] = {
  stage: 'ready', placementId: 'p1', policies: 2, emails: 3, sent: 0, awaitingDetails: [],
  requests: [
    { draftId: 'dA', line: 'CAR', subject: 'Request CAR', body: 'Dear Underwriter,', attachments: [], recipients: [
      { dispatchId: 'x1', insurer: 'EQ', person: 'Chia Li', email: 'li@eq.example' },
      { dispatchId: 'x2', insurer: 'Chubb', person: 'Wang', email: 'wang@chubb.example' },
    ] },
    { draftId: 'dB', line: 'WICA', subject: 'Request WICA', body: 'Dear Underwriter,', attachments: [], recipients: [
      { dispatchId: 'x3', insurer: 'Allianz', person: 'Rachel', email: 'rachel@allianz.example' },
    ] },
  ],
}

let calls: { url: string; method: string; body: any }[]
function mockFetch(bar: Bar) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, method: init?.method ?? 'GET', body })
    const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.includes('/bar') && (init?.method ?? 'GET') === 'GET') return json(bar)
    if (url.includes('available-senders')) return json([{ email: 'nathan@trade-risksol.com', type: 'personal' }])
    if (url.includes('/fanout')) return json({ clones: [
      { draft_id: 'c1', dispatch_id: 'x1', to_email: 'li@eq.example', insurer_name: 'EQ' },
      { draft_id: 'c2', dispatch_id: 'x2', to_email: 'wang@chubb.example', insurer_name: 'Chubb' },
    ] })
    if (url.includes('/api/email/send')) return json({ ok: true, gmailThreadId: 'g', gmailMessageId: 'm' })
    if (url.match(/\/api\/drafts\//) && init?.method === 'POST') return json({ ok: true, draftId: body?.action ? url.split('/').pop() : null })
    return json({ ok: true })
  }))
}

beforeEach(cleanup)

describe('ChiefBar', () => {
  it('shows who the thread waits on and the chaser date', async () => {
    mockFetch(base)
    render(<ChiefBar threadId="t1" />)
    expect(await screen.findByText('Waiting on Serene Tan')).toBeTruthy()
    expect(screen.getByText(/chaser Fri,? 13 Nov · 4 working days$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send chaser' })).toBeTruthy()
  })

  it('names an auto-reply and keeps the timer', async () => {
    mockFetch({ ...base, autoReply: { from: 'sabrina@client.example', at: null } })
    render(<ChiefBar threadId="t1" />)
    expect(await screen.findByText('Auto-reply from sabrina@client.example. Timer unchanged.')).toBeTruthy()
  })

  it('opens a draft on the page and refuses two addresses in To', async () => {
    const onOpenChange = vi.fn()
    mockFetch({ ...base, drafts: [{ id: 'd1', to: 'a@client.example', person: 'Pat', cc: '', subject: 'S', body: 'Hello', label: 'Chaser', workItemId: null, attachments: [], removed: [] }] })
    render(<ChiefBar threadId="t1" onOpenChange={onOpenChange} />)
    fireEvent.click(await screen.findByRole('button', { name: /Chaser/ }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true))
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'a@client.example, b@other.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(calls.some(c => c.url.includes('/api/email/send'))).toBe(false)
  })

  it('sends an enquiry as one email per insurer', async () => {
    mockFetch({ ...base, enquiry })
    render(<ChiefBar threadId="t1" />)
    expect(await screen.findByText('New policy enquiry')).toBeTruthy()
    expect(screen.getByText('Chia Li · EQ')).toBeTruthy()
    expect(calls.some(c => c.url.includes('/api/email/send'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Send all 3 separately' }))
    await waitFor(() => expect(calls.filter(c => c.url.includes('/api/email/send'))).toHaveLength(3))
    const sends = calls.filter(c => c.url.includes('/api/email/send')).map(c => c.body)
    expect(sends.map(s => [s.draftId, s.toEmail])).toEqual([['c1', 'li@eq.example'], ['c2', 'wang@chubb.example'], ['dB', 'rachel@allianz.example']])
    for (const s of sends) expect(s.cc).toBeUndefined()
    await waitFor(() => expect(calls.filter(c => c.url.includes('/dispatches/sent'))).toHaveLength(3))
  })
})
