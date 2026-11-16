import { describe, it, expect } from 'vitest'
import { COMBINE_MAX, caseTypeAmong, clientAmong, fromOfThread, readCombine, titleAmong, titleOf, type CombineSource } from '../combine'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = id(1), OTHER_CLIENT = id(2), INSURER = id(3), TPA = id(4), PARTNER = id(5)
const thread = (o: Partial<CombineSource> & { id: string }): CombineSource => ({ subject: 'Renewal 2027', last_message_at: '2026-11-10T02:00:00Z', label: null, company: null, client_of: null, insurer_of: null, ...o })
const client = { id: CLIENT, name: 'Orchard Foods', kind: 'client' }
const insurer = { id: INSURER, name: 'Harbour Insurance', kind: 'insurer' }

describe('clientAmong', () => {
  it('takes the client most of the threads belong to', () => {
    expect(clientAmong([
      thread({ id: id(10), company: client }),
      thread({ id: id(11), company: insurer, client_of: CLIENT }),
      thread({ id: id(12), company: { id: OTHER_CLIENT, name: 'Quay Logistics', kind: 'client' } }),
    ])).toBe(CLIENT)
  })
  it('reads an insurer’s thread by the client it is about, never by the insurer', () => {
    expect(clientAmong([thread({ id: id(10), company: insurer, client_of: OTHER_CLIENT })])).toBe(OTHER_CLIENT)
    expect(clientAmong([thread({ id: id(10), company: insurer })])).toBeNull()
  })
  it('names no one when no thread is filed', () => {
    expect(clientAmong([thread({ id: id(10) })])).toBeNull()
  })
})

describe('fromOfThread', () => {
  it('puts a thread filed under the client on the client side', () => {
    expect(fromOfThread(thread({ id: id(10), company: client }), CLIENT)).toEqual({ side: 'client', insurer_id: null })
  })
  it('names the insurer a thread is filed under', () => {
    expect(fromOfThread(thread({ id: id(10), company: insurer, client_of: CLIENT }), CLIENT)).toEqual({ side: 'insurer', insurer_id: INSURER })
    expect(fromOfThread(thread({ id: id(10), company: { id: TPA, name: 'Care Administrators', kind: 'tpa' } }), CLIENT)).toEqual({ side: 'insurer', insurer_id: TPA })
  })
  it('names the one insurer taking part when the thread is filed elsewhere', () => {
    const t = thread({ id: id(10), company: { id: PARTNER, name: 'Benefit Partners', kind: 'partner' }, client_of: CLIENT, insurer_of: INSURER })
    expect(fromOfThread(t, CLIENT)).toEqual({ side: 'insurer', insurer_id: INSURER })
  })
  it('leaves the insurer unnamed when none is on file for the thread', () => {
    const t = thread({ id: id(10), company: { id: PARTNER, name: 'Benefit Partners', kind: 'partner' }, client_of: CLIENT })
    expect(fromOfThread(t, CLIENT)).toEqual({ side: 'insurer', insurer_id: null })
  })
  it('reads an unfiled thread as other', () => {
    expect(fromOfThread(thread({ id: id(10) }), CLIENT)).toEqual({ side: 'other', insurer_id: null })
    expect(fromOfThread(thread({ id: id(10), insurer_of: INSURER }), null)).toEqual({ side: 'other', insurer_id: null })
  })
})

describe('caseTypeAmong', () => {
  it('takes the kind most labels point to', () => {
    expect(caseTypeAmong(['claim', 'claim', 'payment'])).toBe('claim')
    expect(caseTypeAmong(['document'])).toBe('documents')
    expect(caseTypeAmong(['payment'])).toBe('premium_billing')
  })
  it('makes a quotation part of a renewal when a renewal is among them', () => {
    expect(caseTypeAmong(['quotation_request', 'quote_received', 'renewal'])).toBe('renewal')
    expect(caseTypeAmong(['quotation_request', 'quote_received'])).toBe('new_quote')
  })
  it('falls to other when no label says', () => {
    expect(caseTypeAmong([])).toBe('other')
    expect(caseTypeAmong([null, undefined, 'other'])).toBe('other')
  })
})

describe('titleOf and titleAmong', () => {
  it('drops reply and forward marks and short bracket tags', () => {
    expect(titleOf('RE: Fwd: [EXT] Group hospital renewal 2027')).toBe('Group hospital renewal 2027')
    expect(titleOf('回复： Renewal terms')).toBe('Renewal terms')
    expect(titleOf('  Re:   ')).toBe('')
    expect(titleOf(null)).toBe('')
  })
  it('keeps the title within its length', () => {
    expect(titleOf(`Re: ${'a'.repeat(300)}`)).toHaveLength(140)
  })
  it('takes the oldest thread that has a subject', () => {
    expect(titleAmong([
      { subject: 'Re: Quote from Harbour', last_message_at: '2026-11-12T02:00:00Z' },
      { subject: 'Re:', last_message_at: '2026-11-01T02:00:00Z' },
      { subject: 'Fw: Renewal 2027', last_message_at: '2026-11-03T02:00:00Z' },
    ])).toBe('Renewal 2027')
    expect(titleAmong([{ subject: null, last_message_at: null }])).toBe('')
  })
})

describe('readCombine', () => {
  const threads = [{ id: id(10), side: 'client' }, { id: id(11), side: 'insurer', insurer_id: INSURER }]
  const fresh = { company_id: CLIENT, case_type: 'renewal', title: '  Renewal   2027 ', threads }
  it('reads a new case', () => {
    expect(readCombine(fresh)).toEqual({
      company_id: CLIENT, case_type: 'renewal', title: 'Renewal 2027', work_item_id: null, move: [],
      threads: [{ id: id(10), side: 'client', insurer_id: null }, { id: id(11), side: 'insurer', insurer_id: INSURER }],
    })
  })
  it('keeps an insurer only on the insurer side, and a thread once', () => {
    const out = readCombine({ ...fresh, threads: [{ id: id(10), side: 'client', insurer_id: INSURER }, { id: id(10), side: 'insurer' }, { id: 'not-an-id', side: 'client' }] })
    expect(out).toMatchObject({ threads: [{ id: id(10), side: 'client', insurer_id: null }] })
  })
  it('reads the threads a person agreed to move', () => {
    expect(readCombine({ ...fresh, move: [id(11), 'x', 7] })).toMatchObject({ move: [id(11)] })
  })
  it('needs no client, kind or title to add to an open case', () => {
    expect(readCombine({ work_item_id: id(20), threads })).toMatchObject({ work_item_id: id(20), company_id: null, title: '' })
  })
  it('says what is missing', () => {
    expect(readCombine({ ...fresh, threads: [] })).toEqual({ error: 'Tick at least one thread.' })
    expect(readCombine(null)).toEqual({ error: 'Tick at least one thread.' })
    expect(readCombine({ ...fresh, threads: [{ id: id(10), side: 'broker' }] })).toEqual({ error: 'Choose a side for every thread.' })
    expect(readCombine({ ...fresh, threads: [{ id: id(10), side: 'insurer', insurer_id: 'acme' }] })).toEqual({ error: 'Choose an insurer on file.' })
    expect(readCombine({ ...fresh, work_item_id: 'case-7' })).toEqual({ error: 'Choose a case.' })
    expect(readCombine({ ...fresh, company_id: null })).toEqual({ error: 'Choose the client.' })
    expect(readCombine({ ...fresh, case_type: 'lawsuit' })).toEqual({ error: 'Choose the kind of case.' })
    expect(readCombine({ ...fresh, title: '   ' })).toEqual({ error: 'Give the case a title.' })
  })
  it('stops at the most threads one case takes at a time', () => {
    const many = Array.from({ length: COMBINE_MAX + 1 }, (_, k) => ({ id: id(100 + k), side: 'client' }))
    expect(readCombine({ ...fresh, threads: many })).toEqual({ error: `Combine up to ${COMBINE_MAX} threads at a time.` })
  })
})
