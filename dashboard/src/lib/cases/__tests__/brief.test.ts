import { describe, it, expect } from 'vitest'
import { buildBrief, draftingAgent, type BriefInput, type BriefNote } from '../brief'
import type { Side, SourceMessage } from '../sources'

const domainKind = new Map([['orchard-foods.example', 'client'], ['harbour-insurance.example', 'insurer'], ['pier-assurance.example', 'insurer']])
const names: Record<string, string> = { 'harbour-insurance.example': 'Harbour Insurance', 'pier-assurance.example': 'Pier Assurance' }
const insurerName = (a: string | null | undefined) => names[String(a ?? '').split('@')[1]?.replace(/>$/, '') ?? ''] ?? null
const sides = new Map<string, Side>([['tc', 'client'], ['ti', 'insurer'], ['tp', 'insurer']])
const msg = (o: Partial<SourceMessage> & { id: string; thread_id: string; sent_at: string }): SourceMessage => ({ direction: 'inbound', from_address: 'hr@orchard-foods.example', subject: 'Renewal 2027', body_text: '', ...o })
const messages: SourceMessage[] = [
  msg({ id: 'c1', thread_id: 'tc', sent_at: '2026-11-01T02:00:00Z', body_text: 'We would like to keep the same hospital plan, but the budget cannot go above $40,000 this year. Can you confirm the renewal date?' }),
  msg({ id: 'c2', thread_id: 'tc', sent_at: '2026-11-02T02:00:00Z', direction: 'outbound', from_address: 'nathan@trade-risksol.com', to: ['hr@orchard-foods.example'], body_text: 'Thank you. Please send the updated census by 12 November so we can approach the market.' }),
  msg({ id: 'i1', thread_id: 'ti', sent_at: '2026-11-03T02:00:00Z', direction: 'outbound', from_address: 'nathan@trade-risksol.com', to: ['uw@harbour-insurance.example'], body_text: 'Please quote renewal terms on the attached census and claims experience.' }),
  msg({ id: 'i2', thread_id: 'ti', sent_at: '2026-11-05T02:00:00Z', from_address: 'uw@harbour-insurance.example', body_text: 'We can hold last year’s rates if the census is received by 20 November. The claims ratio of 92% will load the premium.' }),
  msg({ id: 'p1', thread_id: 'tp', sent_at: '2026-11-04T02:00:00Z', direction: 'outbound', from_address: 'nathan@trade-risksol.com', to: ['quotes@pier-assurance.example'], body_text: 'Please quote on the same basis as expiring.' }),
]
const note = (o: Partial<BriefNote> & { id: string; section: string; text: string }): BriefNote => ({ quote: null, message_id: null, thread_id: null, source_date: null, author: 'case_worker', author_kind: 'agent', status: 'current', created_at: '2026-11-06T02:00:00Z', ...o })
const input = (o: Partial<BriefInput> = {}): BriefInput => ({ messages, sides, visible: new Set(['tc', 'ti', 'tp']), domainKind, insurerName, notes: [], caseType: 'renewal', hasPlacement: false, ...o })

describe('draftingAgent', () => {
  it('names the placement agent on a placement, no one on a claim, the relay otherwise', () => {
    expect(draftingAgent('renewal', true)).toBe('Placement')
    expect(draftingAgent('claim', false)).toBeNull()
    expect(draftingAgent('renewal', false)).toBe('Relay')
  })
})

describe('Communicated', () => {
  it('shows the last email to the client, then the last to each insurer', () => {
    const rows = buildBrief(input()).rows.filter(r => r.part === 'communicated')
    expect(rows.map(r => [r.who, r.date, r.source?.message_id])).toEqual([
      ['To the client', '2026-11-02', 'c2'],
      ['To Pier Assurance', '2026-11-04', 'p1'],
      ['To Harbour Insurance', '2026-11-03', 'i1'],
    ])
    expect(rows[0].text).toContain('updated census by 12 November')
  })
  it('withholds the words of an email in a colleague’s mailbox', () => {
    const rows = buildBrief(input({ visible: new Set(['tc', 'tp']) })).rows.filter(r => r.part === 'communicated')
    const harbour = rows.find(r => r.who === 'To Harbour Insurance')!
    expect(harbour).toMatchObject({ text: '', private: true, date: '2026-11-03' })
    expect(rows.find(r => r.who === 'To the client')!.private).toBeUndefined()
  })
})

describe('notes on the brief', () => {
  const notes = [
    note({ id: 'n1', section: 'wish', text: 'Keep the same hospital plan', quote: 'keep the same hospital plan', thread_id: 'tc', message_id: 'c1', source_date: '2026-11-01' }),
    note({ id: 'n2', section: 'risk', text: 'Claims ratio of 92% will load the premium', quote: 'claims ratio of 92% will load the premium', thread_id: 'ti', message_id: 'i2', source_date: '2026-11-05' }),
    note({ id: 'n3', section: 'success_factor', text: 'Rates held if the census arrives by 20 November', quote: 'hold last year’s rates if the census is received by 20 November', thread_id: 'ti', message_id: 'i2', source_date: '2026-11-05' }),
    note({ id: 'n4', section: 'risk', text: 'Census may be late', quote: 'send the updated census by 12 November', thread_id: 'tc', message_id: 'c2', source_date: '2026-11-02' }),
    note({ id: 'n5', section: 'risk', text: 'Finance director is new', author: 'nathan@trade-risksol.com', author_kind: 'person' }),
    note({ id: 'n6', section: 'open_question', text: 'Client asked for the renewal date', quote: 'Can you confirm the renewal date', thread_id: 'tc', message_id: 'c1', source_date: '2026-11-01' }),
    note({ id: 'n7', section: 'open_question', text: 'Census requested from the client', quote: 'send the updated census by 12 November', thread_id: 'tc', message_id: 'c2', source_date: '2026-11-02' }),
    note({ id: 'n8', section: 'open_question', text: 'Renewal terms requested', quote: 'Please quote renewal terms', thread_id: 'ti', message_id: 'i1', source_date: '2026-11-03' }),
    note({ id: 'n9', section: 'next_step', text: 'Chase the census', status: 'superseded', created_at: '2026-11-06T03:00:00Z' }),
    note({ id: 'n10', section: 'next_step', text: 'Send the census to Harbour Insurance', quote: 'census is received by 20 November', thread_id: 'ti', message_id: 'i2', source_date: '2026-11-05', created_at: '2026-11-06T04:00:00Z' }),
    note({ id: 'n11', section: 'client_said', text: 'Budget is $40,000', quote: 'budget cannot go above $40,000', thread_id: 'tc', message_id: 'c1' }),
  ]
  const brief = buildBrief(input({ notes }))
  const part = (p: string) => brief.rows.filter(r => r.part === p)

  it('names who stated a wish', () => {
    expect(part('wish')).toMatchObject([{ text: 'Keep the same hospital plan', who: 'Client', date: '2026-11-01', source: { message_id: 'c1', quote: 'keep the same hospital plan' } }])
  })
  it('carries the grade a person gave a wish', () => {
    const graded = buildBrief(input({ notes: [note({ id: 'w1', section: 'wish', text: 'Keep the 1-bedded ward', need: 'must' }), note({ id: 'w2', section: 'wish', text: 'Dental', need: 'nice' }), note({ id: 'w3', section: 'wish', text: 'Lower excess' })] })).rows.filter(r => r.part === 'wish')
    expect(graded.map(r => r.kind)).toEqual(['Must have', 'Good to have', undefined])
  })
  it('keeps an agent’s risk or success factor only when the client or an insurer wrote the words', () => {
    expect(part('stated').map(r => [r.kind, r.who, r.note_id])).toEqual([['Risk', 'Harbour Insurance', 'n2'], ['Success factor', 'Harbour Insurance', 'n3'], ['Risk', null, 'n5']])
    expect(brief.left_off).toBe(1) // n4 rests on TRS's own words
    expect(part('stated')[2]).toMatchObject({ author: 'nathan@trade-risksol.com', source: null })
  })
  it('says who owes whom, oldest first', () => {
    expect(part('open').map(r => [r.who, r.date])).toEqual([['TRS owes the client', '2026-11-01'], ['Client owes TRS', '2026-11-02'], ['Harbour Insurance owes TRS', '2026-11-03']])
  })
  it('shows the one current next step and the agent that drafts it', () => {
    expect(part('next')).toMatchObject([{ text: 'Send the census to Harbour Insurance', who: 'Relay drafts', note_id: 'n10' }])
    expect(buildBrief(input({ notes, hasPlacement: true })).rows.find(r => r.part === 'next')!.who).toBe('Placement drafts')
  })
  it('leaves the other sections off the brief', () => {
    expect(brief.rows.some(r => r.note_id === 'n11')).toBe(false)
  })
  it('counts the rows that rest on no email', () => {
    expect(brief.unsourced).toBe(1) // the person's own note
    const bare = buildBrief(input({ nextAction: ' Call the client ' }))
    expect(bare.rows.find(r => r.part === 'next')).toMatchObject({ text: 'Call the client', source: null, who: 'Relay drafts', date: null })
    expect(bare.unsourced).toBe(1)
  })
  it('withholds the quote and the sender of a note from a colleague’s mailbox', () => {
    const hid = buildBrief(input({ notes, visible: new Set(['tc', 'tp']) }))
    const risk = hid.rows.find(r => r.note_id === 'n2')!
    expect(risk).toMatchObject({ private: true, source: { thread_id: 'ti', from: null, quote: null } })
    expect(hid.rows.find(r => r.note_id === 'n1')!.private).toBeUndefined()
  })
})
