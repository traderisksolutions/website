import { describe, it, expect } from 'vitest'
import { inboxPage, countViews, inView, parseView, outsideDomain, PAGE_SIZE, type IndexRow } from '@/lib/mail/inbox-list'

const OPS = 'operations@trade-risksol.com'
const NATHAN = 'nathan.budiutomo@trade-risksol.com'

function row(i: number, over: Partial<IndexRow> = {}): IndexRow {
  return { id: `t${i}`, at: new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString(), companyId: 'c1', owner: 'a@trade-risksol.com', mailboxes: [OPS], last: 'inbound', ...over }
}

describe('Inbox pages', () => {
  it('pages 100 at a time, newest first, with the true total and the next offset', () => {
    const rows = Array.from({ length: 250 }, (_, i) => row(i))
    const p1 = inboxPage(rows, { view: 'all', mailbox: 'all', offset: 0 })
    expect(p1.ids).toHaveLength(PAGE_SIZE)
    expect(p1.ids[0]).toBe('t249')
    expect(p1.total).toBe(250)
    expect(p1.nextOffset).toBe(100)
    const p3 = inboxPage(rows, { view: 'all', mailbox: 'all', offset: 200 })
    expect(p3.ids).toHaveLength(50)
    expect(p3.ids.at(-1)).toBe('t0')
    expect(p3.nextOffset).toBeNull()
  })

  it('counts follow the mailbox pill', () => {
    const rows = [
      row(1, { mailboxes: [OPS] }),
      row(2, { mailboxes: [NATHAN], last: 'outbound' }),
      row(3, { mailboxes: [], companyId: null }),
      row(4, { mailboxes: [NATHAN], owner: null }),
    ]
    expect(inboxPage(rows, { view: 'all', mailbox: 'all', offset: 0 }).counts).toEqual({ all: 4, needs_reply: 3, awaiting_client: 1, unlinked: 1, unassigned: 1 })
    expect(inboxPage(rows, { view: 'all', mailbox: 'operations', offset: 0 }).counts).toEqual({ all: 2, needs_reply: 2, awaiting_client: 0, unlinked: 1, unassigned: 0 })
    expect(inboxPage(rows, { view: 'all', mailbox: NATHAN, offset: 0 }).counts).toEqual({ all: 2, needs_reply: 1, awaiting_client: 1, unlinked: 0, unassigned: 1 })
  })

  it('a view narrows the rows and the total; a search narrows to the ids it found', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i, { last: i % 2 ? 'outbound' : 'inbound' }))
    const p = inboxPage(rows, { view: 'awaiting_client', mailbox: 'all', offset: 0 })
    expect(p.total).toBe(5)
    expect(p.ids.every(id => Number(id.slice(1)) % 2 === 1)).toBe(true)
    const s = inboxPage(rows, { view: 'all', mailbox: 'all', offset: 0, matched: new Set(['t3', 't7']) })
    expect(s.ids).toEqual(['t7', 't3'])
    expect(s.counts.all).toBe(2)
  })

  it('views: unlinked has no company; unassigned has a company without an owner; unknown view is all', () => {
    expect(inView(row(1, { companyId: null }), 'unlinked')).toBe(true)
    expect(inView(row(1, { companyId: null, owner: null }), 'unassigned')).toBe(false)
    expect(inView(row(1, { owner: null }), 'unassigned')).toBe(true)
    expect(parseView('prospects')).toBe('all')
    expect(countViews([]).all).toBe(0)
  })
})

describe('outsideDomain', () => {
  it('takes the most frequent outside domain, never TRS, a personal mailbox or an automated sender', () => {
    expect(outsideDomain(['a@acme.com.sg', 'b@acme.com.sg', 'x@gmail.com', 'n@trade-risksol.com', 'noreply@vendor.com', 'c@other.com'])).toBe('acme.com.sg')
    expect(outsideDomain(['x@gmail.com', 'n@trade-risksol.com'])).toBeNull()
    expect(outsideDomain(['', 'not-an-email'])).toBeNull()
  })
})
