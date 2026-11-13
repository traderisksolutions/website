import { describe, it, expect } from 'vitest'
import { cleanCase, parseAnswer, quoteFound, queueRank, type CaseContext } from '@/lib/casework/clean'

const ctx: CaseContext = {
  threadIds: ['t1', 't2'],
  addresses: ['lisa.daly@celavi.com', 'sinhui.lee@qbe.com', 'chengsou.tan@trade-risksol.com'],
  attachments: ['QBE Quote - Iconic.pdf', 'Claims analysis.xlsx'],
  text: 'Please find attached the anonymised claims record. We are still awaiting the policy schedule and will forward it once received.',
  staff: ['nathan.budiutomo@trade-risksol.com', 'chengsou.tan@trade-risksol.com', 'hasya@trade-risksol.com'],
  today: '2026-10-31',
  departedNames: ['Catherine'],
}

const base = {
  client: 'Iconic Locations Singapore Pte. Ltd.', case_type: 'renewal', title: 'EB renewal 2027', threads: ['t1', 't2', 'tX'],
  status: 'waiting_client', last_activity: '2026-10-30', summary: 'QBE quoted.', next_action: 'Chase the schedule',
  suggested_owner: 'chengsou.tan@trade-risksol.com', confidence: 'high',
  evidence: [{ thread: 't1', quote: 'We are still awaiting the policy schedule' }],
}

describe('cleanCase', () => {
  it('keeps only threads that belong to the case', () => {
    expect(cleanCase(base, ctx)!.threads).toEqual(['t1', 't2'])
  })

  it('drops a case with no known thread or no title', () => {
    expect(cleanCase({ ...base, threads: ['tX'] }, ctx)).toBeNull()
    expect(cleanCase({ ...base, title: '' }, ctx)).toBeNull()
  })

  it('keeps a draft that replies on the case, to people on the case, with files the case holds', () => {
    const c = cleanCase({ ...base, draft: { reply_in_thread: 't1', to: ['Lisa Daly <lisa.daly@celavi.com>'], cc: ['lisa.daly@celavi.com'], subject: 'Re: EB', body: 'Dear Lisa,\n\nThank you.\n\n{owner_name}', attach: ['QBE Quote - Iconic.pdf'] } }, ctx)!
    expect(c.draft).toEqual({ reply_in_thread: 't1', to: ['lisa.daly@celavi.com'], cc: [], subject: 'Re: EB', body: 'Dear Lisa,\n\nThank you.\n\n{owner_name}', attach: ['QBE Quote - Iconic.pdf'] })
    expect(c.draft_withheld).toBeNull()
  })

  it('withholds a draft to an address that is not on the case', () => {
    const c = cleanCase({ ...base, draft: { reply_in_thread: 't1', to: ['someone@else.com'], body: 'Hi' } }, ctx)!
    expect(c.draft).toBeNull()
    expect(c.draft_withheld).toMatch(/someone@else.com is not on the case/)
  })

  it('withholds a draft that attaches a file the case does not hold', () => {
    const c = cleanCase({ ...base, draft: { reply_in_thread: 't1', to: ['lisa.daly@celavi.com'], body: 'Hi', attach: ['Invented.pdf'] } }, ctx)!
    expect(c.draft_withheld).toMatch(/no file named Invented.pdf/)
  })

  it('withholds a draft on a thread outside the case, or signed by someone who left', () => {
    expect(cleanCase({ ...base, draft: { reply_in_thread: 'tX', to: ['lisa.daly@celavi.com'], body: 'Hi' } }, ctx)!.draft_withheld).toMatch(/does not reply/)
    expect(cleanCase({ ...base, draft: { reply_in_thread: 't1', to: ['lisa.daly@celavi.com'], body: 'Hi Lisa\n\nBest regards\nCatherine Lim' } }, ctx)!.draft_withheld).toMatch(/has left/)
  })

  it('never drafts on a finished case', () => {
    const c = cleanCase({ ...base, status: 'done', draft: { reply_in_thread: 't1', to: ['lisa.daly@celavi.com'], body: 'Hi' } }, ctx)!
    expect(c.draft).toBeNull()
    expect(c.next_action).toBeNull()
  })

  it('keeps only quotes that are in the mail, and marks an unsupported case low confidence', () => {
    const c = cleanCase({ ...base, evidence: [{ thread: 't1', quote: 'The client has accepted QBE' }] }, ctx)!
    expect(c.evidence).toEqual([])
    expect(c.confidence).toBe('low')
  })

  it('accepts only real dates and live staff as owner', () => {
    const c = cleanCase({ ...base, deadline: '31 Dec', suggested_owner: 'catherine.lim@trade-risksol.com' }, ctx)!
    expect(c.deadline).toBeNull()
    expect(c.suggested_owner).toBeNull()
    expect(cleanCase({ ...base, deadline: '2027-01-01', deadline_basis: 'renewal' }, ctx)!.deadline).toBe('2027-01-01')
  })

  it('folds an unknown status or type to a safe default', () => {
    const c = cleanCase({ ...base, status: 'pending', case_type: 'misc' }, ctx)!
    expect(c.status).toBe('trs_to_act')
    expect(c.case_type).toBe('other')
  })
})

describe('signature', () => {
  it('lets a draft mention a leaver, but not be signed by one', () => {
    const mention = cleanCase({ ...base, draft: { reply_in_thread: 't1', to: ['lisa.daly@celavi.com'], body: 'Dear Lisa,\n\nI am taking over your account from Catherine, who has left TRS.\n\nBest regards,\n{owner_name}' } }, ctx)!
    expect(mention.draft).not.toBeNull()
    const signed = cleanCase({ ...base, draft: { reply_in_thread: 't1', to: ['lisa.daly@celavi.com'], body: 'Dear Lisa,\n\nThanks.\n\nBest regards,\nCatherine Lim' } }, ctx)!
    expect(signed.draft_withheld).toMatch(/has left/)
  })
})

describe('item_id', () => {
  it('updates only an item the model was shown', () => {
    expect(cleanCase({ ...base, item_id: 'w1' }, { ...ctx, itemIds: ['w1'] })!.item_id).toBe('w1')
    expect(cleanCase({ ...base, item_id: 'w9' }, { ...ctx, itemIds: ['w1'] })!.item_id).toBeNull()
  })
})

describe('quoteFound', () => {
  it('ignores spacing, quote marks and ellipses between fragments', () => {
    expect(quoteFound('anonymised  claims record ... still awaiting the policy schedule', ctx.text)).toBe(true)
    expect(quoteFound('“We are still awaiting”', ctx.text)).toBe(true)
    expect(quoteFound('short', ctx.text)).toBe(false)
  })
})

describe('parseAnswer', () => {
  it('reads an object with cases, a bare array, or a fenced string', () => {
    expect(parseAnswer({ cases: [1, 2] })).toEqual([1, 2])
    expect(parseAnswer([1])).toEqual([1])
    expect(parseAnswer('```json\n{"cases":[{"a":1}]}\n```')).toEqual([{ a: 1 }])
    expect(parseAnswer('not json')).toEqual([])
  })
})

describe('queueRank', () => {
  it('puts late TRS work and decisions first, waiting last, done out', () => {
    const today = '2026-10-31'
    const late = queueRank({ status: 'trs_to_act', deadline: '2026-10-29', needs_human: null, waiting_since: null }, today)
    const decide = queueRank({ status: 'trs_to_act', deadline: null, needs_human: 'Approve payee', waiting_since: null }, today)
    const soon = queueRank({ status: 'trs_to_act', deadline: '2026-11-03', needs_human: null, waiting_since: null }, today)
    const wait = queueRank({ status: 'waiting_insurer', deadline: null, needs_human: null, waiting_since: '2026-10-20' }, today)
    const done = queueRank({ status: 'done', deadline: null, needs_human: null, waiting_since: null }, today)
    expect([late, decide, soon, wait, done]).toEqual([...[late, decide, soon, wait, done]].sort((a, b) => a - b))
  })
})

import { twinOf, titleTokens } from '@/lib/casework/clean'

describe('twinOf', () => {
  const open = [
    { id: 'a', title: 'Claim Pending Further Action (EXAMPLE CLINIC PTE LTD-N0000001)', policy_number: 'N0000001', threads: ['t1'] },
    { id: 'b', title: 'Addition of 2 staff (A. Lim, B. Tan) - Example Insurer', policy_number: null, threads: ['t2'] },
  ]
  it('joins a reminder of an open matter by title words', () => {
    expect(twinOf({ title: '[External] 3rd Reminder: Claim Pending Further Action (EXAMPLE CLINIC PTE LTD-N0000001)', policy_number: null, threads: ['t9'] }, open)).toBe('a')
  })
  it('joins by shared thread and by policy number', () => {
    expect(twinOf({ title: 'Something else entirely here', policy_number: null, threads: ['t2'] }, open)).toBe('b')
    expect(twinOf({ title: 'Different words about a matter', policy_number: 'N000 0001', threads: [] }, open)).toBe('a')
  })
  it('leaves a new matter alone', () => {
    expect(twinOf({ title: 'Removal of one staff member - credit note', policy_number: null, threads: ['t3'] }, open)).toBeNull()
    expect(titleTokens('Re: Fwd: 2nd Reminder: Motor renewal SXX0000X').has('reminder')).toBe(false)
  })
})
