import { describe, it, expect } from 'vitest'
import { caseModeFor, isClientKind } from '../kinds'
import { pairFor, partyOf, composeForward, buildDraft, needsForwardToInsurer, type DraftFacts } from '../drafts'
import { laterActive, clearsOnMessage, laterDue } from '../later'
import { chaseDecision } from '../sweeps'
import { caseCompanyFor, readsFacts, laterToClear, ebViaQueue, focusThreads } from '../../a/intake-routes'
import { cleanCase, type CaseContext } from '@/lib/casework/clean'

describe('which companies hold client cases', () => {
  it('only clients, or companies with no kind yet, are clients', () => {
    expect(caseModeFor('client')).toBe('client')
    expect(caseModeFor(null)).toBe('client')
    expect(caseModeFor('partner')).toBe('partner')
    for (const k of ['insurer', 'tpa', 'vendor', 'other']) expect(caseModeFor(k)).toBe('none')
    expect(isClientKind('partner')).toBe(false)
  })
  it('a thread under an insurer, TPA or vendor falls back to the client the references name', () => {
    expect(caseCompanyFor({ companyId: 'c1', kind: 'client' }, 'r1')).toBe('c1')
    expect(caseCompanyFor({ companyId: 'p1', kind: 'partner' }, 'r1')).toBe('p1')
    expect(caseCompanyFor({ companyId: 't1', kind: 'tpa' }, 'r1')).toBe('r1')
    expect(caseCompanyFor({ companyId: 'v1', kind: 'vendor' }, null)).toBeNull()
    expect(caseCompanyFor({ companyId: null, kind: null }, 'r1')).toBe('r1')
  })
  it('facts are read from client mail on a client record only', () => {
    expect(readsFacts('client', 'client')).toBe(true)
    expect(readsFacts('client', 'partner')).toBe(false)
    expect(readsFacts('client', 'vendor')).toBe(false)
    expect(readsFacts('insurer', 'client')).toBe(false)
  })
})

describe('paired drafts', () => {
  it('pairs an insurer chase with a client update and a forward with a client acknowledgement', () => {
    expect(pairFor('chase_insurer')).toBe('client_update')
    expect(pairFor('forward_to_insurer')).toBe('client_ack')
    expect(pairFor('chase_client')).toBeNull()
    expect(pairFor('renewal_notice')).toBeNull()
    expect(partyOf('forward_to_insurer')).toBe('insurer')
    expect(partyOf('client_ack')).toBe('client')
  })

  const f: DraftFacts = {
    greetingName: 'Pat', clientName: 'Example Trading Pte Ltd', title: 'Damage at unit 3', policyNumber: 'P-123456', insurerName: 'Example Insurance',
    insurerRef: null, claimant: null, lossDate: '2026-10-28', threadSubject: 'Damage at unit 3',
    original: { from: 'ops@client.example', sent_at: '2026-10-29T02:00:00Z', subject: 'Damage at unit 3', text: 'Our ceiling leaked overnight. Photos attached.' },
    files: ['photo1.jpg', 'photo2.jpg'],
  }

  it('forwards the client message under a short cover note, files listed, signature left for the approver', () => {
    const d = composeForward(f)
    expect(d.subject).toBe('New claim – Example Trading Pte Ltd – P-123456 – Damage at unit 3')
    expect(d.body).toContain("our client Example Trading Pte Ltd's notification of a claim under Policy No. P-123456, loss on 28 Oct 2026")
    expect(d.body).toContain('Attached: photo1.jpg, photo2.jpg.')
    expect(d.body).toContain('---------- Forwarded message ----------\nFrom: ops@client.example')
    expect(d.body).toContain('Our ceiling leaked overnight.')
    expect(d.body).toContain('{owner_name}')
    expect(d.body.indexOf('{owner_name}')).toBeLessThan(d.body.indexOf('Forwarded message'))
  })
  it('never writes a facts it does not hold', () => {
    const d = composeForward({ ...f, clientName: null, policyNumber: null, lossDate: null, files: [], original: null })
    expect(d.body).toContain("our client's notification of a claim.")
    expect(d.body).not.toContain('Attached:')
    expect(d.body).not.toContain('Forwarded message')
    expect(d.body).not.toContain("client 's")
  })
  it('writes the client side of each pair', () => {
    expect(buildDraft('client_update', f).body).toContain('we have asked Example Insurance for the status today')
    expect(buildDraft('client_ack', f).body).toContain('We have notified Example Insurance of Damage at unit 3')
    expect(buildDraft('client_ack', f).body).toContain('sent the documents you provided')
  })
  it('forwards a claim only when nothing has reached the insurer yet', () => {
    const client = { side: 'client' }
    expect(needsForwardToInsurer([client], 'notified')).toBe(true)
    expect(needsForwardToInsurer([client, { side: 'insurer' }], 'notified')).toBe(false)
    expect(needsForwardToInsurer([client, { side: 'trs', toInsurer: true }], 'notified')).toBe(false)
    expect(needsForwardToInsurer([client, { side: 'trs', toInsurer: false }], 'documents_pending')).toBe(true)
    expect(needsForwardToInsurer([client], 'with_insurer')).toBe(false)
    expect(needsForwardToInsurer([{ side: 'trs' }], 'notified')).toBe(false)
  })
})

describe('come back later', () => {
  const now = '2026-11-02T03:00:00.000Z'
  it('holds until a time, or until a side replies', () => {
    expect(laterActive({ later_until: '2026-11-02T09:00:00.000Z' }, now)).toBe(true)
    expect(laterActive({ later_until: '2026-11-01T09:00:00.000Z' }, now)).toBe(false)
    expect(laterActive({ later_when: 'insurer_reply' }, now)).toBe(true)
    expect(laterActive({}, now)).toBe(false)
  })
  it('ends on a reply from the awaited side only', () => {
    expect(clearsOnMessage({ later_when: 'client_reply' }, 'client')).toBe(true)
    expect(clearsOnMessage({ later_when: 'client_reply' }, 'insurer')).toBe(false)
    expect(clearsOnMessage({ later_when: 'insurer_reply' }, 'insurer')).toBe(true)
    expect(clearsOnMessage({ later_until: '2026-11-03T00:00:00Z' }, 'client')).toBe(false)
    expect(laterToClear([{ id: 'a', later_when: 'client_reply' }, { id: 'b', later_when: 'insurer_reply' }, { id: 'c' }], 'client')).toEqual(['a'])
  })
  it('a timed wait comes due; a wait for a reply never does on time alone', () => {
    expect(laterDue({ later_until: '2026-11-01T00:00:00Z' }, now)).toBe(true)
    expect(laterDue({ later_until: '2026-11-03T00:00:00Z' }, now)).toBe(false)
    expect(laterDue({ later_until: '2026-11-01T00:00:00Z', later_when: 'client_reply' }, now)).toBe(false)
  })
  it('the chaser leaves an item set aside alone', () => {
    const waiting = { status: 'waiting_insurer', waiting_since: '2026-10-01', last_activity_at: null, snoozed_until: null, closed_at: null }
    expect(chaseDecision(waiting, '2026-11-02').chase).toBe('chase_insurer')
    expect(chaseDecision({ ...waiting, later_when: 'insurer_reply' }, '2026-11-02').chase).toBeNull()
    expect(chaseDecision({ ...waiting, later_until: '2026-11-05T01:00:00Z' }, '2026-11-02').chase).toBeNull()
    expect(chaseDecision({ ...waiting, later_until: '2026-10-30T01:00:00Z' }, '2026-11-02').chase).toBe('chase_insurer')
  })
})

describe('intake hand-offs', () => {
  it('keeps EB movements on the ingest path unless the queue path is switched on', () => {
    expect(ebViaQueue({})).toBe(false)
    expect(ebViaQueue({ ADMIN_EB_VIA_QUEUE: '1' })).toBe(true)
  })
  it('reads the whole client until the group has a ledger, then only the threads that moved', () => {
    expect(focusThreads({ cursor: 0, entries: [], payloadThreads: ['t1'] })).toBeNull()
    expect(focusThreads({ cursor: 0, entries: [{ thread_id: 't2' }, { thread_id: null }], payloadThreads: ['t1'] })).toEqual(['t1', 't2'])
    expect(focusThreads({ cursor: 40, entries: [], payloadThreads: ['t1'] })).toEqual(['t1'])
  })
})

describe('case worker pairs', () => {
  const ctx: CaseContext = {
    threadIds: ['th-client', 'th-ins'], addresses: ['pat@client.example', 'desk@insurer.example', 'operations@trade-risksol.com'],
    attachments: [], text: 'Please update us on the claim status. We are still waiting for the outcome.', staff: ['ernest@trade-risksol.com'], today: '2026-11-02',
  }
  const draft = (party: string, thread: string, to: string) => ({ reply_in_thread: thread, to: [to], cc: [], subject: 'Re: claim', body: 'Dear X,\n\nUpdate.\n\n{owner_name}', attach: [], party })
  const base = {
    item_id: null, client: 'Client', case_type: 'claim', title: 'Claim', threads: ['th-client', 'th-ins'], status: 'waiting_insurer',
    evidence: [{ thread: 'th-client', quote: 'Please update us on the claim status' }], confidence: 'high',
  }
  it('keeps a client and insurer pair', () => {
    const c = cleanCase({ ...base, draft: draft('insurer', 'th-ins', 'desk@insurer.example'), pair_draft: draft('client', 'th-client', 'pat@client.example') }, ctx)!
    expect(c.draft?.party).toBe('insurer')
    expect(c.pair_draft?.party).toBe('client')
    expect(c.pair_withheld).toBeNull()
  })
  it('withholds a pair of two emails to the same side', () => {
    const c = cleanCase({ ...base, draft: draft('insurer', 'th-ins', 'desk@insurer.example'), pair_draft: draft('insurer', 'th-ins', 'desk@insurer.example') }, ctx)!
    expect(c.draft).not.toBeNull()
    expect(c.pair_draft).toBeNull()
    expect(c.pair_withheld).toBe('a pair needs one client and one insurer email')
  })
  it('withholds a pair addressed to someone not on the case, and keeps the main draft', () => {
    const c = cleanCase({ ...base, draft: draft('insurer', 'th-ins', 'desk@insurer.example'), pair_draft: draft('client', 'th-client', 'stranger@else.example') }, ctx)!
    expect(c.draft).not.toBeNull()
    expect(c.pair_draft).toBeNull()
    expect(c.pair_withheld).toContain('stranger@else.example')
  })
  it('a pair without a main draft is dropped', () => {
    const c = cleanCase({ ...base, draft: null, pair_draft: draft('client', 'th-client', 'pat@client.example') }, ctx)!
    expect(c.draft).toBeNull()
    expect(c.pair_draft).toBeNull()
  })
})
