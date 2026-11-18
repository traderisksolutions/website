import { describe, expect, it } from 'vitest'
import { addItemsFrom, emailList, groupRows, rowKey, sideOfAddress, type DeskDraft, type DeskThread } from './desk'

const T = (id: string, o: Partial<DeskThread> = {}): DeskThread => ({
  threadId: id, subject: `Subject ${id}`, side: 'client', companyId: 'c1', owner: 'hasya@trade-risksol.com',
  lastAt: '2026-11-18T10:00:00Z', lastFrom: null, lastInbound: false, messages: 3, addedAt: '2026-11-19T00:00:00Z', ...o,
})
const D = (id: string, o: Partial<DeskDraft> = {}): DeskDraft => ({
  id, side: 'client', threadId: 't1', anchorThreadId: null, to: 'a@client.invalid', person: null, cc: '', subject: 's', body: 'b',
  label: 'Email', attachments: [], removed: [], workItemId: null, createdAt: '2026-11-19T01:00:00Z', ...o,
})
const UUID = '0b8a4b3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

describe('sideOfAddress', () => {
  const insurers = new Set(['singlife.com', 'income.com.sg'])
  it('an insurer domain or its subdomain is the insurer', () => {
    expect(sideOfAddress('eb@singlife.com', insurers)).toBe('insurer')
    expect(sideOfAddress('x@sg.income.com.sg', insurers)).toBe('insurer')
  })
  it('anything else, or nothing, is the client', () => {
    expect(sideOfAddress('janice@client.invalid', insurers)).toBe('client')
    expect(sideOfAddress('notsinglife.com@x.invalid', insurers)).toBe('client')
    expect(sideOfAddress(null, insurers)).toBe('client')
  })
})

describe('groupRows', () => {
  it('one row per owner and client; a thread without a client stands alone', () => {
    const rows = groupRows([T('t1'), T('t2', { side: 'insurer' }), T('t3', { companyId: null })], [], new Map([['c1', 'Client One']]), new Map())
    expect(rows.map(r => r.key).sort()).toEqual([rowKey('hasya@trade-risksol.com', 'c1', 't1'), rowKey('hasya@trade-risksol.com', null, 't3')].sort())
    expect(rows.find(r => r.companyId === 'c1')!.threads).toHaveLength(2)
    expect(rows.find(r => r.companyId === 'c1')!.companyName).toBe('Client One')
  })
  it('a draft joins the row of its thread, else of its anchor thread', () => {
    const rows = groupRows([T('t1'), T('t9', { companyId: 'c2' })], [D('d1'), D('d2', { threadId: null, anchorThreadId: 't9', side: 'insurer' }), D('d3', { threadId: 'other' })], new Map(), new Map())
    expect(rows.find(r => r.companyId === 'c1')!.drafts.map(d => d.id)).toEqual(['d1'])
    expect(rows.find(r => r.companyId === 'c2')!.drafts.map(d => d.id)).toEqual(['d2'])
  })
  it('most drafts first, then the client waiting on TRS', () => {
    const rows = groupRows([T('t1'), T('t2', { companyId: 'c2', lastInbound: true }), T('t3', { companyId: 'c3' })], [D('d1', { threadId: 't3' }), D('d2', { threadId: 't3' })], new Map(), new Map())
    expect(rows.map(r => r.companyId)).toEqual(['c3', 'c2', 'c1'])
  })
  it('on Everyone a shared thread shows its draft on each owner’s row', () => {
    const rows = groupRows([T('t1'), T('t1', { owner: 'nathan@trade-risksol.com' })], [D('d1')], new Map(), new Map())
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.drafts.length === 1)).toBe(true)
    expect(emailList(rows)).toHaveLength(1)
  })
})

describe('emailList', () => {
  it('oldest draft first, each once', () => {
    const rows = groupRows([T('t1'), T('t2', { companyId: 'c2' })], [D('new', { createdAt: '2026-11-19T05:00:00Z' }), D('old', { threadId: 't2', createdAt: '2026-11-17T05:00:00Z' })], new Map(), new Map())
    expect(emailList(rows).map(d => d.id)).toEqual(['old', 'new'])
  })
})

describe('addItemsFrom', () => {
  it('keeps known sides and one entry per thread', () => {
    const r = addItemsFrom({ threads: [{ threadId: UUID, side: 'client', companyId: UUID }, { threadId: UUID, side: 'insurer', companyId: null }] })
    expect(r).toEqual({ items: [{ threadId: UUID, side: 'insurer', companyId: null }] })
  })
  it('refuses an unknown side, a bad id, or nothing', () => {
    expect(addItemsFrom({ threads: [{ threadId: UUID, side: 'broker' }] })).toHaveProperty('error')
    expect(addItemsFrom({ threads: [{ threadId: 'x', side: 'client' }] })).toHaveProperty('error')
    expect(addItemsFrom({ threads: [] })).toHaveProperty('error')
    expect(addItemsFrom(null)).toHaveProperty('error')
  })
})

describe('normalisePoints', () => {
  it('strings only, one line each, at most five', async () => {
    const { normalisePoints } = await import('./desk-read')
    expect(normalisePoints(['a\n b', '', null, 'c', 'd', 'e', 'f', 'g'])).toEqual(['a b', 'c', 'd', 'e', 'f'])
    expect(normalisePoints('not a list')).toEqual([])
    expect(normalisePoints(['x'.repeat(400)])[0]).toHaveLength(220)
  })
})

describe('oneEmailPerPerson', () => {
  it('an email to someone with an unsent draft becomes an action to fold it in', async () => {
    const { oneEmailPerPerson } = await import('./desk-read')
    const step = (id: string, email: string) => ({ id, kind: 'email' as const, party: 'client' as const, insurer: null, productLine: null, title: `Ask ${id}`, detail: 'd', to: { email, name: 'Janice', contactId: null }, status: 'proposed' as const, draftId: null })
    const out = oneEmailPerPerson([step('a', 'Janice@x.invalid'), step('b', 'other@x.invalid')], [{ id: 'd1', email: 'janice@x.invalid', name: 'Janice Sim' }])
    expect(out[0]).toMatchObject({ kind: 'action', to: null, title: 'Add to the pending email to Janice', op: 'update', draftId: 'd1' })
    expect(out[0].detail).toContain('Ask a')
    expect(out[1]).toMatchObject({ kind: 'email' })
  })
})

describe('linkPending and markSource', () => {
  const base = { party: 'internal' as const, insurer: null, productLine: null, to: null, status: 'proposed' as const, draftId: null }
  const pending = [{ id: 'd1', email: 'janice.sim@client.invalid', name: 'Janice Sim' }, { id: 'd2', email: 'pearlin@client.invalid', name: 'Pearlin Chan' }]
  it('ties a model action to the one draft it names', async () => {
    const { linkPending } = await import('./desk-read')
    const out = linkPending([
      { ...base, id: 'a', kind: 'action', title: 'Discard the pending email to Pearlin Chan', detail: 'It is out of date.' },
      { ...base, id: 'b', kind: 'action', title: 'Update the pending email to Janice', detail: 'Add the password ask.' },
      { ...base, id: 'c', kind: 'action', title: 'Recalculate the comparison', detail: 'Without co-pay.' },
      { ...base, id: 'd', kind: 'action', title: 'Discard the pending emails', detail: 'to Janice Sim and Pearlin Chan' },
    ], pending)
    expect(out.map(s => [s.op ?? null, s.draftId])).toEqual([['discard', 'd2'], ['update', 'd1'], [null, null], [null, null]])
  })
  it('an insurer email is on the thread when its domain is', async () => {
    const { markSource } = await import('./desk-read')
    const email = (id: string, address: string) => ({ ...base, id, kind: 'email' as const, party: 'insurer' as const, title: 't', detail: 'd', to: { email: address, name: null, contactId: null } })
    const out = markSource([email('a', 'victorine@chubb.invalid'), email('b', 'ivy@aig.invalid')], new Set(['chubb.invalid']))
    expect(out.map(s => s.source)).toEqual(['thread', 'file'])
  })
})
