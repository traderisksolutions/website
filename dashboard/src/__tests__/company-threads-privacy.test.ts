/**
 * INB-002 on the company pages: the company Reader and Threads tab (listVisibleCompanyThreads),
 * Unfiled threads (listUnfiledForViewer) never return a colleague's private thread; they count it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ROWS: Record<string, unknown[]> = {}
const OWN = ['t-shared', 't-nathan', 't-nathan-cc']

vi.mock('@/lib/crm/db', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/crm/db')>()
  const route = (path: string) => {
    const table = path.split('?')[0]
    const idsIn = /(?:^|[?&])(?:id|thread_id)=in\.\(([^)]*)\)/.exec(path)?.[1]?.split(',') ?? null
    let rows = (ROWS[table] ?? []) as Record<string, unknown>[]
    if (idsIn) rows = rows.filter(r => idsIn.includes(String(r.thread_id ?? r.id)))
    const email = /[?&]email=eq\.([^&]*)/.exec(path)?.[1]
    if (email) rows = rows.filter(r => r.email === decodeURIComponent(email))
    if (table === 'email_messages' && /from_address=ilike/.test(path)) {
      const who = decodeURIComponent(/from_address=ilike\.([^&]*)/.exec(path)![1]).replace(/\*/g, '')
      rows = rows.filter(r => String(r.from_address ?? '').includes(who))
    }
    if (table === 'thread_insurers') rows = rows.filter(r => path.includes(`client_company_id=eq.${r.client_company_id}`))
    return rows
  }
  return {
    ...real,
    sb: vi.fn(async (path: string) => route(path)),
    sbTry: vi.fn(async (path: string) => route(path)),
    sbAll: vi.fn(async (path: string) => route(path)),
    getCompanyThreadIds: vi.fn(async () => OWN),
  }
})

import { listVisibleCompanyThreads, splitVisible } from '@/lib/crm/threads'
import { listUnfiledForViewer, freshSuggestion } from '@/lib/crm/triage'
import { waitingOn } from '@/lib/crm/waiting-on'

const thread = (id: string, extra: Record<string, unknown> = {}) => ({ id, subject: `Subject ${id}`, display_subject: null, snippet: null, category: null, status: 'active', message_count: 0, last_message_at: '2026-11-19T00:00:00Z', contact_id: null, contacts: null, company_id: null, ...extra })

beforeEach(() => {
  ROWS.email_threads = [thread('t-shared'), thread('t-nathan'), thread('t-nathan-cc'), thread('t-insurer')]
  ROWS.email_thread_aliases = [
    { thread_id: 't-shared', mailbox: 'operations@trade-risksol.com' },
    { thread_id: 't-nathan', mailbox: 'nathan@trade-risksol.com' },
    { thread_id: 't-nathan-cc', mailbox: 'nathan@trade-risksol.com' },
    { thread_id: 't-insurer', mailbox: 'nathan@trade-risksol.com' },
  ]
  ROWS.email_participants = [{ thread_id: 't-nathan-cc', email: 'hasya@trade-risksol.com' }]
  ROWS.email_messages = [
    { id: 'm1', thread_id: 't-shared', direction: 'inbound', sent_at: '2026-11-18T00:00:00Z', from_address: 'hr@client.sg', subject: 'Census' },
    { id: 'm2', thread_id: 't-nathan', direction: 'outbound', sent_at: '2026-11-18T00:00:00Z', from_address: 'nathan@trade-risksol.com', subject: 'Private' },
  ]
  ROWS.thread_summaries = []
  ROWS.case_threads = []
  ROWS.thread_insurers = [{ thread_id: 't-insurer', client_company_id: 'c1', insurer_company_id: 'ins1' }]
  ROWS.companies = [{ id: 'ins1', company_name: 'Liberty' }]
  ROWS.company_link_suggestions = []
})

describe('company threads by mailbox rule', () => {
  it('drops a colleague’s private thread and counts it', async () => {
    const { threads, hidden } = await listVisibleCompanyThreads('c1', 'hasya@trade-risksol.com')
    expect(threads.map(t => t.id).sort()).toEqual(['t-nathan-cc', 't-shared'])
    expect(hidden).toBe(1)
  })

  it('the owner sees their own thread', async () => {
    const { threads, hidden } = await listVisibleCompanyThreads('c1', 'nathan@trade-risksol.com')
    expect(threads.map(t => t.id)).toContain('t-nathan')
    expect(hidden).toBe(0)
  })

  it('adds insurer threads that name the client, marked via, under the same rule', async () => {
    const asNathan = await listVisibleCompanyThreads('c1', 'nathan@trade-risksol.com', { insurers: true })
    expect(asNathan.threads.find(t => t.id === 't-insurer')?.via?.name).toBe('Liberty')
    const asHasya = await listVisibleCompanyThreads('c1', 'hasya@trade-risksol.com', { insurers: true })
    expect(asHasya.threads.some(t => t.id === 't-insurer')).toBe(false)
    expect(asHasya.hidden).toBe(2)
  })

  it('ownIds: the visible threads filed under the company, never a colleague’s or an insurer’s (the company page overview and people read these)', async () => {
    const asHasya = await listVisibleCompanyThreads('c1', 'hasya@trade-risksol.com', { insurers: true })
    expect([...asHasya.ownIds].sort()).toEqual(['t-nathan-cc', 't-shared'])
    const asNathan = await listVisibleCompanyThreads('c1', 'nathan@trade-risksol.com', { insurers: true })
    expect(asNathan.ownIds).toContain('t-nathan')
    expect(asNathan.ownIds).not.toContain('t-insurer')
  })

  it('a cron call (no viewer) sees everything', async () => {
    const { threads, hidden } = await listVisibleCompanyThreads('c1', null)
    expect(threads).toHaveLength(3)
    expect(hidden).toBe(0)
  })

  it('names who each thread waits on', async () => {
    const { threads } = await listVisibleCompanyThreads('c1', 'nathan@trade-risksol.com')
    expect(threads.find(t => t.id === 't-shared')?.waitingOn).toBe('trs')
    expect(threads.find(t => t.id === 't-nathan')?.waitingOn).toBe('client')
  })
})

describe('Unfiled threads by mailbox rule', () => {
  it('lists only what the viewer may see, the rest as a count', async () => {
    const { threads, hidden } = await listUnfiledForViewer('hasya@trade-risksol.com')
    expect(threads.map(t => t.id).sort()).toEqual(['t-nathan-cc', 't-shared'])
    expect(hidden).toBe(2)
  })

  it('shows a suggestion only when made in the last 14 days', () => {
    const now = Date.parse('2026-11-20T00:00:00Z')
    expect(freshSuggestion({ created_at: '2026-11-10T00:00:00Z' }, now)).not.toBeNull()
    expect(freshSuggestion({ created_at: '2026-10-01T00:00:00Z' }, now)).toBeNull()
    expect(freshSuggestion(null, now)).toBeNull()
  })
})

describe('pure pieces', () => {
  it('splitVisible counts the rest', () => {
    expect(splitVisible([{ id: 'a' }, { id: 'b' }], new Set(['a']))).toEqual({ shown: [{ id: 'a' }], hidden: 1 })
  })
  it('waitingOn: inbound → TRS; outbound → client, or insurer on an insurer thread; skips auto-replies', () => {
    const out = { direction: 'outbound', from_address: 'nathan@trade-risksol.com', subject: 'Quote', sent_at: '1' }
    const ooo = { direction: 'inbound', from_address: 'hr@x.sg', subject: 'Automatic reply: Quote', sent_at: '2' }
    expect(waitingOn([out], false)).toBe('client')
    expect(waitingOn([out], true)).toBe('insurer')
    expect(waitingOn([out, ooo], false)).toBe('client')
    expect(waitingOn([{ ...out, direction: 'inbound', from_address: 'hr@x.sg' }], false)).toBe('trs')
    expect(waitingOn([out], false, 'closed')).toBeNull()
    expect(waitingOn([], false)).toBeNull()
  })
})
