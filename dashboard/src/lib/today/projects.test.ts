import { describe, expect, it } from 'vitest'
import { nameWords, partiesOf, subjectWords, suggestProjects } from './projects'

// Real subject shapes from a contractor client with many sites (names kept generic where possible).
const CCCC = [
  'Re: (TRS) CCCC - Valley Point Shopping Centre Survey PL',
  'Dover Drive Residential Development Show Flat_CAR  (Trade Solutions)',
  'Re: Dover Drive Mix Development_CAR & Employer Liability (Trade Solutions)',
  "RE: Dover Drive - Contractors' All Risks for Preliminary Works (11 June 2026 to 10 June 2027)",
  'Fwd: (TRS) CCCC - Tuas Tower Tender',
  'Re: Chencharu Mix Development - Invitation to Quote (Insurance)',
  "Re: Dover Drive Residential Development - CAR & Employer's Liability for Preliminary Stage",
  'FW: T5A Superstructure Tender_RFQ for Insurances_Trade Risk Solutions Pte. Ltd.',
  'Re: (TRS) ECICS - CCCC (Dover Show Flat CAR)',
].map((subject, i) => ({ threadId: `t${i}`, subject }))
const exclude = nameWords('CHINA COMMUNICATIONS CONSTRUCTION COMPANY LIMITED', 'ECICS Limited', 'Trade Solutions', 'Trade Risk Solutions')

describe('suggestProjects', () => {
  it('finds the site that repeats across threads, longest name on the same threads', () => {
    const s = suggestProjects(CCCC, exclude)
    expect(s[0]).toEqual({ name: 'Dover Drive', threadIds: ['t1', 't2', 't3', 't6', 't8'] })
  })
  it('never offers a cover, a step, the client or a one-off name', () => {
    const names = suggestProjects(CCCC, exclude).map(s => s.name.toLowerCase())
    for (const bad of ['car', 'development', 'employer liability', 'cccc', 'tuas tower', 'insurance', 'preliminary']) expect(names).not.toContain(bad)
  })
  it('does not offer a name whose threads all sit under one already chosen', () => {
    const names = suggestProjects(CCCC, exclude).map(s => s.name)
    expect(names).not.toContain('Residential Development')
    expect(names).not.toContain('Dover Drive Residential Development')
  })
  it('leaves out a project already set, and needs two threads', () => {
    expect(suggestProjects(CCCC, exclude, ['Dover Drive']).map(s => s.name)).not.toContain('Dover Drive')
    expect(suggestProjects([{ threadId: 'a', subject: 'Marina Bay Sands works' }], [])).toEqual([])
  })
  it('the client’s initials are not a project', () => {
    expect(nameWords('China Communications Construction Company Limited')).toContain('cccc')
  })
  it('strips reply prefixes and the (TRS) tag', () => {
    expect(subjectWords('RE: Fwd: (TRS) Allianz - Forsea | Dover Dr')).toEqual(['Allianz', 'Forsea', 'Dover', 'Dr'])
  })
})

describe('partiesOf', () => {
  const insurers = new Map([['ecics.com.sg', 'ECICS'], ['allianz.com', 'Allianz']])
  it('sorts people into client, each insurer and others; TRS and robots left out', () => {
    const p = partiesOf([
      { name: 'Jiaqing', email: 'Jiaqing@ccccltd.sg' }, { name: null, email: 'jiaqing@ccccltd.sg' },
      { name: 'Amy', email: 'amy@ecics.com.sg' }, { name: 'Bob', email: 'bob@sg.allianz.com' },
      { name: 'Nathan', email: 'nathan@trade-risksol.com' }, { name: null, email: 'noreply@ccccltd.sg' },
      { name: 'QS', email: 'qs@consultant.invalid' },
    ], ['ccccltd.sg'], insurers)
    expect(p.client).toEqual([{ name: 'Jiaqing', email: 'jiaqing@ccccltd.sg' }])
    expect(p.insurers.map(g => g.insurer)).toEqual(['Allianz', 'ECICS'])
    expect(p.others.map(o => o.email)).toEqual(['qs@consultant.invalid'])
  })
  it('without client domains, people on client threads are the client', () => {
    const p = partiesOf([{ name: 'A', email: 'a@x.invalid', side: 'client' }, { name: 'B', email: 'b@y.invalid', side: 'insurer' }], [], new Map())
    expect(p.client.map(x => x.email)).toEqual(['a@x.invalid'])
    expect(p.others.map(x => x.email)).toEqual(['b@y.invalid'])
  })
})
