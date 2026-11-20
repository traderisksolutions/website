import { describe, expect, it } from 'vitest'
import type { ReadPlan, ReadStep } from '@/lib/chief/read'
import {
  annualPremium, attachmentsFrom, editedAt, foldSummary, groupProjects, participantsLine, previewHref, projectFrom, projectNames,
  suggestFiles, threadForStep, type DeskDraft, type DeskRow, type DeskThread, type ThreadFile,
} from './desk'

const T = (id: string, o: Partial<DeskThread> = {}): DeskThread => ({
  threadId: id, subject: `Subject ${id}`, side: 'client', companyId: 'c1', owner: 'hasya@trade-risksol.com',
  lastAt: '2026-11-18T10:00:00Z', lastFrom: null, lastInbound: false, messages: 3, addedAt: '2026-11-19T00:00:00Z', ...o,
})
const D = (id: string, o: Partial<DeskDraft> = {}): DeskDraft => ({
  id, side: 'client', threadId: 't1', anchorThreadId: null, to: 'a@client.invalid', person: null, cc: '', subject: `Subject of ${id}`, body: 'b',
  label: 'Email', attachments: [], removed: [], workItemId: null, createdAt: '2026-11-19T01:00:00Z', ...o,
})
const S = (o: Partial<ReadStep>): ReadStep => ({ id: 's', kind: 'email', party: 'client', insurer: null, productLine: null, title: 'Ask for the census', detail: '', to: null, status: 'proposed', draftId: null, ...o })
const R = (threads: DeskThread[], drafts: DeskDraft[], read: ReadPlan | null = null): DeskRow => ({ key: 'k', owner: 'o', companyId: 'c1', companyName: 'Client One', threads, drafts, read, lastAt: null })
const plan = (steps: ReadStep[]): ReadPlan => ({ at: '', by: '', summary: '', situation: '', steps, model: '' })

describe('groupProjects', () => {
  it('threads without a project sit under the client first; each project after, latest first', () => {
    const g = groupProjects(R([
      T('t1'), T('t2', { project: 'Main project', lastAt: '2026-11-10T00:00:00Z' }),
      T('t3', { project: 'Dover Drive Showflat', projectNote: 'Fit-out CAR', lastAt: '2026-11-17T00:00:00Z' }), T('t4', { project: 'main PROJECT' }),
    ], [D('d1', { threadId: 't3' }), D('d2', { threadId: null, anchorThreadId: 't2' }), D('d3', { threadId: 'gone' })]))
    expect(g.map(x => x.project)).toEqual([null, 'Main project', 'Dover Drive Showflat'])
    expect(g[1].threads.map(t => t.threadId)).toEqual(['t2', 't4'])
    expect(g[2].note).toBe('Fit-out CAR')
    expect(g[2].drafts.map(d => d.id)).toEqual(['d1'])
    expect(g[1].drafts.map(d => d.id)).toEqual(['d2'])
    expect(g[0].drafts.map(d => d.id)).toEqual(['d3'])
  })
  it('the client group is left out when every thread has a project and no draft is loose', () => {
    expect(groupProjects(R([T('t1', { project: 'A' })], [])).map(x => x.project)).toEqual(['A'])
  })
  it('names the projects once each, any case', () => {
    expect(projectNames(R([T('a', { project: 'b' }), T('b', { project: 'A ' }), T('c', { project: 'B' })], []))).toEqual(['A', 'b'])
  })
})

describe('foldSummary', () => {
  it('per project: whom, the project description, and the first draft subject with the rest counted', () => {
    const row = R([T('t1'), T('t2', { project: 'Showflat', projectNote: 'Dover Drive' })], [
      D('d1', { threadId: 't2' }), D('d2', { threadId: 't2' }), D('d3', { side: 'insurer', insurer: 'Insurer Co', threadId: 't1' }),
    ])
    expect(foldSummary(row, 'client')).toEqual([{ party: 'Client One', project: 'Dover Drive', todo: 'Subject of d1', more: 1, threadId: 't2' }])
    expect(foldSummary(row, 'insurer')).toEqual([{ party: 'Insurer Co', project: null, todo: 'Subject of d3', more: 0, threadId: 't1' }])
  })
  it('no draft: the first open Read step for that side; nothing open: empty', () => {
    const row = R([T('t1'), T('t9', { side: 'insurer' })], [], plan([S({ id: 'a', status: 'done' }), S({ id: 'b', party: 'insurer', insurer: 'Insurer Co', title: 'Ask for terms' })]))
    expect(foldSummary(row, 'insurer')).toEqual([{ party: 'Insurer Co', project: null, todo: 'Ask for terms', more: 0, threadId: 't9' }])
    expect(foldSummary(row, 'client')).toEqual([])
  })
})

describe('threadForStep', () => {
  const row = R([T('c1t', { lastAt: '2026-11-01T00:00:00Z' }), T('c2t', { lastAt: '2026-11-05T00:00:00Z' }), T('i1', { side: 'insurer', lastFrom: 'x@one.invalid' }), T('i2', { side: 'insurer', lastFrom: 'y@two.invalid' })], [D('d', { threadId: 'c1t' })])
  it('a drafted step opens its draft’s thread', () => expect(threadForStep(S({ draftId: 'd' }), row)).toBe('c1t'))
  it('a client step opens the latest client thread', () => expect(threadForStep(S({}), row)).toBe('c2t'))
  it('an insurer step opens the thread of its domain, else the first insurer thread', () => {
    expect(threadForStep(S({ party: 'insurer', to: { email: 'z@two.invalid', name: null, contactId: null } }), row)).toBe('i2')
    expect(threadForStep(S({ party: 'insurer' }), row)).toBe('i1')
  })
})

describe('suggestFiles', () => {
  const F = (id: string, filename: string, threadId: string, created_at: string): ThreadFile => ({ id, filename, threadId, created_at, storage_url: `gmail:${id}` })
  it('key documents first, then the draft’s own thread, then newest; one per name; attached left out', () => {
    const out = suggestFiles([
      F('1', 'photo-notes.pdf', 'own', '2026-11-19'), F('2', 'Census 2026.xlsx', 'other', '2026-11-01'), F('3', 'letter.pdf', 'other', '2026-11-18'),
      F('4', 'Schedule.pdf', 'own', '2026-10-01'), F('5', 'census 2026.xlsx', 'other', '2026-11-05'), F('6', 'quote.pdf', 'own', '2026-11-19'),
    ], 'own', [{ filename: 'QUOTE.pdf', storage_url: 'gmail:x' }])
    expect(out.map(f => f.id)).toEqual(['4', '5', '1', '3'])
  })
})

describe('attachments', () => {
  it('keeps the send route’s shape and known references only', () => {
    const ok = attachmentsFrom([{ filename: 'a.pdf', mime_type: 'application/pdf', storage_url: 'drivefile:1AbCdEfGhIjK' }, { filename: 'A.pdf', storage_url: 'gmail:0b8a4b3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b' }])
    expect(ok).toEqual({ attachments: [{ filename: 'a.pdf', mime_type: 'application/pdf', storage_url: 'drivefile:1AbCdEfGhIjK' }] })
    expect(attachmentsFrom([{ filename: 'x', storage_url: 'https://x.invalid/storage/v1/object/a' }])).toHaveProperty('error')
    expect(attachmentsFrom([{ filename: 'x', storage_url: 'javascript:alert(1)' }])).toHaveProperty('error')
    expect(attachmentsFrom(Array.from({ length: 11 }, (_, i) => ({ filename: `${i}.pdf`, storage_url: 'drivefile:1AbCdEfGhIjK' })))).toHaveProperty('error')
    expect(attachmentsFrom('x')).toHaveProperty('error')
  })
  it('opens an email file through the documents route, a Drive file on Drive', () => {
    expect(previewHref({ storage_url: 'gmail:abc' })).toBe('/api/engagement/attachments/abc/download')
    expect(previewHref({ storage_url: 'drivefile:XYZ' })).toBe('https://drive.google.com/file/d/XYZ/view')
    expect(previewHref({ storage_url: 'drivefile:XYZ', document_id: 'd1' })).toBe('/api/documents/d1/file')
    expect(previewHref({ storage_url: 'legacy/path.pdf' })).toBeNull()
  })
})

describe('projectFrom', () => {
  it('trims; empty clears project and description', () => {
    expect(projectFrom({ project: '  Dover  Drive ', note: ' Showflat ' })).toEqual({ project: 'Dover Drive', note: 'Showflat' })
    expect(projectFrom({ project: '', note: 'x' })).toEqual({ project: null, note: null })
    expect(projectFrom({ project: 'x'.repeat(81) })).toHaveProperty('error')
    expect(projectFrom({ project: 3 })).toHaveProperty('error')
  })
})

describe('editedAt, participantsLine', () => {
  it('a draft changed more than 5 seconds after it was written shows Updated', () => {
    expect(editedAt({ createdAt: '2026-11-20T01:00:00Z', updatedAt: '2026-11-20T01:00:02Z' })).toBeNull()
    expect(editedAt({ createdAt: '2026-11-20T01:00:00Z', updatedAt: '2026-11-20T02:00:00Z' })).toBe('2026-11-20T02:00:00Z')
    expect(editedAt({ createdAt: '2026-11-20T01:00:00Z' })).toBeNull()
  })
  it('names with addresses, the rest counted', () => {
    const p = participantsLine([{ name: 'Ann Lee', email: 'ann@x.invalid' }, { name: null, email: 'b@x.invalid' }, { name: 'C', email: 'c@x.invalid' }, { name: 'D', email: 'd@x.invalid' }])
    expect(p.text).toBe('Ann Lee <ann@x.invalid>, b@x.invalid, C <c@x.invalid>')
    expect(p.more).toBe(1)
  })
})

describe('annualPremium', () => {
  it('per live policy: the latest placing debit note, else the policy premium; summed per currency', () => {
    const out = annualPremium(
      [{ id: 'p1', premium: 1000, currency: 'SGD' }, { id: 'p2', premium: '2500.5', currency: null }, { id: 'p3', premium: null, currency: 'USD' }, { id: 'p4', premium: 0, currency: 'USD' }],
      [
        { policy_id: 'p1', gross_amount: 1200, currency: 'SGD', issue_date: '2025-01-01', event_type: 'new_business' },
        { policy_id: 'p1', gross_amount: 1300, currency: 'SGD', issue_date: '2026-01-01', event_type: 'renewal' },
        { policy_id: 'p1', gross_amount: 99, currency: 'SGD', issue_date: '2026-06-01', event_type: 'endorsement' },
        { policy_id: 'p3', gross_amount: 700, currency: 'USD', issue_date: '2026-02-01', event_type: 'new_business' },
      ])
    expect(out).toEqual([{ currency: 'SGD', amount: 3800.5 }, { currency: 'USD', amount: 700 }])
  })
  it('nothing on file: empty, so nothing shows', () => {
    expect(annualPremium([{ id: 'p', premium: null, currency: null }], [])).toEqual([])
  })
})
