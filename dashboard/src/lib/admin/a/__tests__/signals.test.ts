import { describe, it, expect } from 'vitest'
import { referenceTokens, findReferences, refKey, subjectCore, overlap, isOutOfOffice, isClaimLike, uensIn, senderKind } from '../signals'
import { scoreCase, bestCase, type CaseCandidate, type MessageSignals } from '../match'
import { gapsFor, leftOffTrs } from '../gaps'
import { readHistory } from '../history'
import * as F from './fixtures'

describe('references', () => {
  it('proposes policy-like tokens and drops dates, phones and short numbers', () => {
    const t = referenceTokens('Policy 2026-F1234567-BFP, ref QZX4821K, call 96917211, on 2026-10-15, qty 12345, DECXY26-004321')
    expect(t).toContain('2026F1234567BFP')
    expect(t).toContain('QZX4821K')
    expect(t).toContain('DECXY26004321')
    expect(t).not.toContain('96917211')
    expect(t).not.toContain('20261015')
    expect(t).not.toContain('12345')
  })
  it('finds references on file, including one inside a longer token', () => {
    const onFile = new Map([[refKey('2026-F1234567-BFP'), 'p1'], [refKey('00987600'), 'p2']])
    const hits = findReferences('Our policy no. 2026-F1234567-BFP/01 and 00987600', onFile)
    expect(hits.map(h => h.value).sort()).toEqual(['p1', 'p2'])
  })
})

describe('subjects and senders', () => {
  it('strips reply and forward prefixes and tags', () => {
    expect(subjectCore('RE: Fwd: [External] (TRS) Acme Pte Ltd - WIC Renewal 2026')).toEqual(['acme', 'wic', 'renewal', '2026'])
    expect(overlap(subjectCore('Re: Damage at Harbourfront unit'), subjectCore('Fwd: Damage at Harbourfront unit'))).toBe(1)
  })
  it('spots out-of-office replies', () => {
    expect(isOutOfOffice('Automatic reply: Renewal', '')).toBe(true)
    expect(isOutOfOffice('Re: Renewal', 'I am currently out of the office until 3 Nov.')).toBe(true)
    expect(isOutOfOffice('Re: Renewal', 'Please proceed.')).toBe(false)
  })
  it('spots claim talk: subject alone, or two body signals', () => {
    expect(isClaimLike('WICA claim - worker injury', '')).toBe(true)
    expect(isClaimLike('Damage at unit', 'Water leaked and damaged our stock. Date of loss 20 Sep.')).toBe(true)
    expect(isClaimLike('Renewal', 'Please renew the policy.')).toBe(false)
  })
  it('reads UENs', () => {
    expect(uensIn('UEN 201599999Z and T08LL1234A, not 12345678')).toEqual(['201599999Z', 'T08LL1234A'])
  })
  it('classes senders', () => {
    const o = { isInternal: (e: string) => e.endsWith('@trade-risksol.com'), isAutomated: (e: string) => e.includes('noreply'), insurerDomains: new Set(['insurer-example.com']) }
    expect(senderKind('a@trade-risksol.com', o)).toBe('internal')
    expect(senderKind('noreply@x.com', o)).toBe('automated')
    expect(senderKind('b@sg.insurer-example.com', o)).toBe('insurer')
    expect(senderKind('c@client.example', o)).toBe('client')
  })
})

const cand = (over: Partial<CaseCandidate>): CaseCandidate => ({ workItemId: 'w', caseType: 'claim', companyId: 'c', title: '', claimRefs: [], policyRefs: [], people: [], subjectWords: [], lastActivity: '2026-09-22T00:00:00Z', ...over })
const sig = (over: Partial<MessageSignals>): MessageSignals => ({ refs: [], people: [], subjectWords: [], sentAt: '2026-10-01T00:00:00Z', claimLike: false, ...over })

describe('case matching', () => {
  it('prefers an insurer claim reference over everything', () => {
    const m = scoreCase(sig({ refs: ['GC26004411'] }), cand({ claimRefs: ['GC26004411'] }))
    expect(m?.joinedBy).toBe('claim_ref')
    expect(m?.score).toBe(1)
  })
  it('a policy number joins with one matter word, and claim talk prefers the claim case', () => {
    const s = sig({ refs: ['2026F1234567BFP'], claimLike: true, subjectWords: subjectCore('Re: Water damage Harbourfront') })
    const claim = cand({ workItemId: 'claim', caseType: 'claim', policyRefs: ['2026F1234567BFP'], subjectWords: subjectCore('Water damage claim — Harbourfront') })
    const renewal = cand({ workItemId: 'renewal', caseType: 'renewal', policyRefs: ['2026F1234567BFP'], subjectWords: subjectCore('Harbourfront shop renewal') })
    expect(bestCase(s, [renewal, claim])?.workItemId).toBe('claim')
  })
  it('a policy number alone does not join: a new matter on an old policy stays new', () => {
    const s = sig({ refs: ['2026F1234567BFP'], claimLike: true, subjectWords: subjectCore('Claim for Lee Ah Kow') })
    expect(bestCase(s, [cand({ caseType: 'claim', policyRefs: ['2026F1234567BFP'], subjectWords: subjectCore('Claim for Tan Mei Ling') })])).toBeNull()
  })
  it("the client's own name proves nothing", () => {
    const s = sig({ people: ['hr@acme.example'], subjectWords: subjectCore('Acme Holdings staff additions') })
    const c = cand({ people: ['hr@acme.example'], subjectWords: subjectCore('Acme Holdings WIC renewal'), nameWords: subjectCore('Acme Holdings Pte Ltd') })
    expect(bestCase(s, [c])).toBeNull()
  })
  it('joins on the same person and subject within 60 days', () => {
    const s = sig({ people: ['pat@acme.example'], subjectWords: subjectCore('Fwd: Damage at Harbourfront unit') })
    const c = cand({ people: ['pat@acme.example'], subjectWords: subjectCore('Damage at Harbourfront unit') })
    expect(scoreCase(s, c)?.joinedBy).toBe('subject')
    expect(scoreCase({ ...s, sentAt: '2027-03-01T00:00:00Z' }, c)).toBeNull()
  })
  it('does not guess between two equal cases', () => {
    const s = sig({ refs: ['QZX4821K'], subjectWords: ['harbourfront'] })
    expect(bestCase(s, [cand({ workItemId: 'a', caseType: 'renewal', policyRefs: ['QZX4821K'], subjectWords: ['harbourfront'] }), cand({ workItemId: 'b', caseType: 'renewal', policyRefs: ['QZX4821K'], subjectWords: ['harbourfront'] })])).toBeNull()
  })
  it('does not join on people alone with an unrelated subject', () => {
    const s = sig({ people: ['pat@acme.example'], subjectWords: ['invoice', 'october'] })
    expect(bestCase(s, [cand({ people: ['pat@acme.example'], subjectWords: ['damage', 'harbourfront'] })])).toBeNull()
  })
})

describe('gaps for a case opened from history', () => {
  const h = readHistory(F.CLIENT_FORWARDS_TWO, 'Fwd: Damage at Harbourfront unit')
  it('lists files named but not held, and nothing that is held', () => {
    const g = gapsFor(h.messages, ['IMG_2041.jpg'], { refFound: true, claimLike: true })
    expect(g.map(x => x.item)).toEqual(['Repair quotation HF-0922.pdf', 'IMG_2042.jpg'])
  })
  it('asks for the policy or claim number when none was found', () => {
    const g = gapsFor([], [], { refFound: false, claimLike: true })
    expect(g).toEqual([{ item: 'Policy or claim number', basis: 'not found in the mail' }])
  })
  it('names the outside people who never copied TRS', () => {
    const left = leftOffTrs(readHistory(F.APPLE_FORWARD, 'Fwd: x').messages, e => e.endsWith('@trade-risksol.com'))
    expect(left).toEqual(['morgan.kwan@insurer-example.com', 'riley.tan@example-hk.com', 'dana.ho@insurer-example.com'])
    expect(leftOffTrs(h.messages, e => e.endsWith('@trade-risksol.com'))).toEqual([])
  })
})
