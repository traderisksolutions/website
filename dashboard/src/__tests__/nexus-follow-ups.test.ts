import { describe, it, expect } from 'vitest'
import { addWorkingDays, dueFor, dueAtFromDate, dedupeKey, viewsOf, dueTone, chaseable, isLive, sgtDate, statusOf } from '@/lib/nexus/rules'
import { cleanReaderOutput, plannedRows, partyOf, brokerOn, latestText } from '@/lib/nexus/reader'
import { mapDispatch, mapPolicy, mapDebitNote, planSync, type DispatchRec, type PolicyRec, type DebitNoteRec } from '@/lib/nexus/sources'
import { chaseBlocker } from '@/lib/nexus/chases'

// 2026-10-30 is a Friday; 2026-10-31 Saturday; 2026-11-02 Monday.
const sgt = (local: string) => new Date(`${local}+08:00`)

describe('working days', () => {
  it('skips the weekend', () => {
    expect(addWorkingDays(sgt('2026-10-30T10:00:00'), 1)).toBe('2026-11-02') // Fri + 1 = Mon
    expect(addWorkingDays(sgt('2026-10-31T10:00:00'), 1)).toBe('2026-11-02') // Sat + 1 = Mon
    expect(addWorkingDays(sgt('2026-11-01T10:00:00'), 1)).toBe('2026-11-02') // Sun + 1 = Mon
    expect(addWorkingDays(sgt('2026-11-02T10:00:00'), 3)).toBe('2026-11-05') // Mon + 3 = Thu
    expect(addWorkingDays(sgt('2026-10-29T10:00:00'), 3)).toBe('2026-11-03') // Thu + 3 = Tue
  })
  it('counts in Singapore time, not UTC', () => {
    // 23:30 SGT Thursday is 15:30 UTC Thursday; 07:00 SGT Friday is 23:00 UTC Thursday.
    expect(sgtDate(sgt('2026-10-30T07:00:00'))).toBe('2026-10-30')
    expect(addWorkingDays(sgt('2026-10-30T07:00:00'), 1)).toBe('2026-11-02')
  })
  it('zero days on a weekend rolls to Monday', () => {
    expect(addWorkingDays(sgt('2026-10-31T10:00:00'), 0)).toBe('2026-11-02')
  })
  it('due dates fall at 18:00 SGT', () => {
    expect(dueAtFromDate('2026-11-02')).toBe('2026-11-02T10:00:00.000Z')
  })
})

describe('house rule', () => {
  const since = sgt('2026-10-29T09:00:00') // Thursday
  it('client waiting on TRS: 1 working day', () => expect(dueFor('trs', since, null)).toBe(dueAtFromDate('2026-10-30')))
  it('TRS waiting on insurer: 3 working days', () => expect(dueFor('insurer', since, null)).toBe(dueAtFromDate('2026-11-03')))
  it('TRS waiting on client: 3 working days', () => expect(dueFor('client', since, null)).toBe(dueAtFromDate('2026-11-03')))
  it('a stated date wins', () => expect(dueFor('insurer', since, '2026-11-10')).toBe(dueAtFromDate('2026-11-10')))
  it('a stated date before the message is ignored', () => expect(dueFor('trs', since, '2026-10-01')).toBe(dueAtFromDate('2026-10-30')))
  it('a garbage date is ignored', () => expect(dueFor('trs', since, '2026-13-45')).toBe(dueAtFromDate('2026-10-30')))
  it('dates carry their own date only', () => expect(dueFor('date', since, null)).toBeNull())
})

describe('dedupe keys', () => {
  it('one shape per source, stable', () => {
    expect(dedupeKey.email('m1', 0)).toBe('email:m1:0')
    expect(dedupeKey.email('m1', 1)).not.toBe(dedupeKey.email('m1', 0))
    expect(dedupeKey.rfq('d1')).toBe('rfq:d1')
    expect(dedupeKey.renewal('p1', '2026-12-01')).toBe('renewal:p1:2026-12-01')
    expect(dedupeKey.renewal('p1', '2027-12-01')).not.toBe(dedupeKey.renewal('p1', '2026-12-01'))
    expect(dedupeKey.debitNote('n1')).toBe('debit_note:n1')
  })
})

describe('views', () => {
  const now = sgt('2026-10-29T12:00:00')
  const base = { owner_party: 'insurer' as const, owner_email: null, status: 'open' as const, snoozed_until: null, closed_at: null }
  it('overdue and waiting', () => expect(viewsOf({ ...base, due_at: sgt('2026-10-28T18:00:00').toISOString() }, now)).toEqual(['overdue', 'waiting']))
  it('due this week', () => expect(viewsOf({ ...base, owner_party: 'trs', due_at: sgt('2026-11-02T18:00:00').toISOString() }, now)).toEqual(['week']))
  it('done this week', () => expect(viewsOf({ ...base, status: 'done', due_at: null, closed_at: sgt('2026-10-27T12:00:00').toISOString() }, now)).toEqual(['done']))
  it('done long ago is in no view', () => expect(viewsOf({ ...base, status: 'done', due_at: null, closed_at: sgt('2026-10-01T12:00:00').toISOString() }, now)).toEqual([]))
  it('snoozed is hidden until the snooze ends', () => {
    expect(isLive({ status: 'snoozed', snoozed_until: sgt('2026-10-30T12:00:00').toISOString() }, now)).toBe(false)
    expect(isLive({ status: 'snoozed', snoozed_until: sgt('2026-10-28T12:00:00').toISOString() }, now)).toBe(true)
  })
  it('due tone', () => {
    expect(dueTone(sgt('2026-10-28T18:00:00').toISOString(), now)).toBe('overdue')
    expect(dueTone(sgt('2026-10-30T18:00:00').toISOString(), now)).toBe('soon')
    expect(dueTone(sgt('2026-11-05T18:00:00').toISOString(), now)).toBeNull()
  })
  it('chaseable: overdue, owed by others, not RFQ, with an address', () => {
    const r = { ...base, due_at: sgt('2026-10-28T18:00:00').toISOString(), counterparty_email: 'a@b.com', source_kind: 'email' as const }
    expect(chaseable(r, now)).toBe(true)
    expect(chaseable({ ...r, source_kind: 'rfq' }, now)).toBe(false)
    expect(chaseable({ ...r, counterparty_email: null }, now)).toBe(false)
    expect(chaseable({ ...r, owner_party: 'trs' }, now)).toBe(false)
    expect(chaseBlocker({ ...r, status: 'done' }, now)).toBe('Not open')
  })
})

describe('reader JSON cleaning', () => {
  const addrs = ['jane@client.com', 'uw@msig.com.sg']
  it('reads a fenced string and keeps valid rows', () => {
    const raw = '```json\n{"open":[{"owes":"insurer","counterparty_email":"UW@msig.com.sg","counterparty_name":"MSIG","what":"Revised quotation for WICA","due":"2026-11-04"}],"close":["a"]}\n```'
    const r = cleanReaderOutput(raw, ['a', 'b'], addrs)
    expect(r.open).toEqual([{ owes: 'insurer', counterparty_email: 'uw@msig.com.sg', counterparty_name: 'MSIG', what: 'Revised quotation for WICA', due: '2026-11-04' }])
    expect(r.close).toEqual(['a'])
  })
  it('drops bad owners, empty tasks, invented addresses, bad dates and unknown close ids', () => {
    const r = cleanReaderOutput({
      open: [
        { owes: 'broker', what: 'x quote' },
        { owes: 'client', what: '' },
        { owes: 'client', what: 'Send signed proposal form', counterparty_email: 'made@up.com', due: '31/10/2026' },
        null,
      ],
      close: ['zzz', 'a', 'a', 5],
    }, ['a'], addrs)
    expect(r.open).toEqual([{ owes: 'client', counterparty_email: null, counterparty_name: null, what: 'Send signed proposal form', due: null }])
    expect(r.close).toEqual(['a'])
  })
  it('caps at five rows and trims long text', () => {
    const r = cleanReaderOutput({ open: Array.from({ length: 9 }, () => ({ owes: 'trs', what: 'y'.repeat(400) })) }, [], [])
    expect(r.open).toHaveLength(5)
    expect(r.open[0].what).toHaveLength(160)
  })
  it('unreadable answers are empty', () => {
    expect(cleanReaderOutput('not json', [], [])).toEqual({ open: [], close: [] })
    expect(cleanReaderOutput([1, 2], [], [])).toEqual({ open: [], close: [] })
    expect(cleanReaderOutput(null, [], [])).toEqual({ open: [], close: [] })
  })
})

describe('reader mapping', () => {
  it('parties', () => {
    const ins = new Set(['msig.com.sg'])
    expect(partyOf('nathan@trade-risksol.com', ins)).toBe('trs')
    expect(partyOf('uw@msig.com.sg', ins)).toBe('insurer')
    expect(partyOf('jane@client.com', ins)).toBe('client')
  })
  it('broker: TRS sender, else a named TRS recipient, else the company owner', () => {
    expect(brokerOn({ from_address: 'Angela <angela@trade-risksol.com>' }, [], 'o@trade-risksol.com')).toBe('angela@trade-risksol.com')
    expect(brokerOn({ from_address: 'jane@client.com' }, [{ email: 'operations@trade-risksol.com', name: null, role: 'to' }, { email: 'Nathan@trade-risksol.com', name: null, role: 'cc' }], null)).toBe('nathan@trade-risksol.com')
    expect(brokerOn({ from_address: 'jane@client.com' }, [{ email: 'operations@trade-risksol.com', name: null, role: 'to' }], 'o@trade-risksol.com')).toBe('o@trade-risksol.com')
  })
  it('strips quoted history', () => {
    expect(latestText('Please send the revised quote by Friday.\n\nOn Tue, 27 Oct 2026, Jane wrote:\n> old text')).toBe('Please send the revised quote by Friday.')
  })
  it('planned rows carry the house-rule due date and per-message keys', () => {
    const rows = plannedRows({ open: [{ owes: 'trs', counterparty_email: 'jane@client.com', counterparty_name: 'Jane', what: 'Send the policy wording', due: null }], close: [] }, {
      message: { id: 'm1', thread_id: 't1', sent_at: sgt('2026-10-30T10:00:00').toISOString(), created_at: sgt('2026-10-30T10:00:00').toISOString() },
      companyId: 'c1', broker: 'nathan@trade-risksol.com', claim: false, label: 'WICA renewal',
    })
    expect(rows).toEqual([expect.objectContaining({ owner_party: 'trs', due_at: dueAtFromDate('2026-11-02'), dedupe_key: 'email:m1:0', source_kind: 'email', company_id: 'c1', owner_email: 'nathan@trade-risksol.com' })])
  })
})

describe('source sync mapping', () => {
  const now = sgt('2026-10-29T12:00:00')
  const owners = new Map<string, string | null>([['c1', 'nathan@trade-risksol.com']])
  const d: DispatchRec = { id: 'd1', company_id: 'c1', insurer_name: 'MSIG', to_email: 'uw@msig.com.sg', status: 'sent', thread_id: 't1',
    sent_at: '2026-10-27T02:00:00Z', last_inbound_at: null, next_chase_at: '2026-10-30T01:00:00Z', placements: { ref: 'Q-0142' }, placement_lines: { label: 'WICA', product_line: 'wica' } }
  it('a sent dispatch: the insurer owes a quotation by the chase date', () => {
    expect(mapDispatch(d, owners, now)).toEqual(expect.objectContaining({ owner_party: 'insurer', what: 'Quotation for WICA', due_at: '2026-10-30T01:00:00Z', source_label: 'Q-0142', dedupe_key: 'rfq:d1', owner_email: 'nathan@trade-risksol.com' }))
  })
  it('an info request: TRS owes it', () => {
    expect(mapDispatch({ ...d, status: 'info_requested', last_inbound_at: sgt('2026-10-29T09:00:00').toISOString() }, owners, now))
      .toEqual(expect.objectContaining({ owner_party: 'trs', dedupe_key: 'rfq:d1:info', due_at: dueAtFromDate('2026-10-30') }))
  })
  it('quoted, declined, withdrawn, drafted: nothing owed', () => {
    for (const status of ['quoted', 'declined', 'withdrawn', 'drafted', 'expired']) expect(mapDispatch({ ...d, status }, owners, now)).toBeNull()
  })
  const p: PolicyRec = { id: 'p1', company_id: 'c1', policy_number: 'WC-1', insurer: 'MSIG', label: 'WICA', class_of_insurance: null, product_line: 'wica', end_date: '2026-12-15', lifecycle: 'live' }
  it('renewals within 60 days are dates', () => {
    expect(mapPolicy(p, owners, now)).toEqual(expect.objectContaining({ owner_party: 'date', what: 'Renewal: WICA', due_at: dueAtFromDate('2026-12-15'), dedupe_key: 'renewal:p1:2026-12-15' }))
    expect(mapPolicy({ ...p, end_date: '2027-02-01' }, owners, now)).toBeNull()
    expect(mapPolicy({ ...p, lifecycle: 'quoting' }, owners, now)).toBeNull()
    expect(mapPolicy({ ...p, end_date: '2026-08-01' }, owners, now)).toBeNull()
  })
  const n: DebitNoteRec = { id: 'n1', company_id: 'c1', debit_note_no: 'DN-77', issue_date: '2026-10-01', payment_due_date: '2026-10-31', currency: 'SGD',
    gross_amount: 1000, net_amount: 1000, paid_amount: 250, status: 'partially_paid', origin: 'new', contacts: { email: 'Jane@Client.com', first_name: 'Jane', last_name: 'Tan' } }
  it('unpaid debit notes: the client owes the balance', () => {
    expect(mapDebitNote(n, owners)).toEqual(expect.objectContaining({ owner_party: 'client', what: 'Payment of debit note DN-77, SGD 750.00', counterparty_email: 'jane@client.com', counterparty_name: 'Jane Tan', dedupe_key: 'debit_note:n1' }))
    expect(mapDebitNote({ ...n, status: 'paid' }, owners)).toBeNull()
    expect(mapDebitNote({ ...n, origin: 'historical' }, owners)).toBeNull()
    expect(mapDebitNote({ ...n, payment_due_date: null }, owners)).toBeNull()
    expect(mapDebitNote({ ...n, paid_amount: 1000 }, owners)).toBeNull()
  })
  it('sync: inserts new, redates moved, closes gone', () => {
    const want = [mapDispatch(d, owners, now)!, mapDispatch({ ...d, id: 'd2' }, owners, now)!]
    const live = [
      { id: 'r1', dedupe_key: 'rfq:d1', due_at: '2026-10-29T01:00:00Z', what: 'Quotation for WICA' },
      { id: 'r3', dedupe_key: 'rfq:d3', due_at: null, what: 'Quotation for PI' },
    ]
    const plan = planSync(want, live)
    expect(plan.insert.map(x => x.dedupe_key)).toEqual(['rfq:d2'])
    expect(plan.redate).toEqual([{ id: 'r1', due_at: '2026-10-30T01:00:00Z', what: 'Quotation for WICA' }])
    expect(plan.close).toEqual(['r3'])
  })
  it('sync: an unchanged row is left alone', () => {
    const w = mapDispatch(d, owners, now)!
    expect(planSync([w], [{ id: 'r1', dedupe_key: w.dedupe_key, due_at: '2026-10-30T01:00:00.000Z', what: w.what }])).toEqual({ insert: [], redate: [], close: [] })
  })
})

describe('status chip', () => {
  const now = sgt('2026-10-29T12:00:00')
  const at = (s: string) => sgt(s).toISOString()
  it('done view', () => expect(statusOf({ owner_party: 'trs', due_at: null }, 'done', now)).toEqual({ label: 'Done', tone: 'green' }))
  it('overdue counts SGT days', () => {
    expect(statusOf({ owner_party: 'trs', due_at: at('2026-10-26T18:00:00') }, 'overdue', now)).toEqual({ label: 'Overdue · 3 days', tone: 'red' })
    expect(statusOf({ owner_party: 'insurer', due_at: at('2026-10-29T09:00:00') }, 'overdue', now)).toEqual({ label: 'Overdue · 1 day', tone: 'red' })
  })
  it('today and tomorrow are amber, even when owed by others', () => {
    expect(statusOf({ owner_party: 'trs', due_at: at('2026-10-29T18:00:00') }, 'week', now)).toEqual({ label: 'Due today', tone: 'amber' })
    expect(statusOf({ owner_party: 'client', due_at: at('2026-10-30T18:00:00') }, 'week', now)).toEqual({ label: 'Due tomorrow', tone: 'amber' })
  })
  it('later: waiting for others, the date for us', () => {
    expect(statusOf({ owner_party: 'insurer', due_at: at('2026-11-04T18:00:00') }, 'waiting', now)).toEqual({ label: 'Waiting', tone: 'blue' })
    expect(statusOf({ owner_party: 'trs', due_at: at('2026-11-04T18:00:00') }, 'week', now)).toEqual({ label: 'Due 4 Nov', tone: 'neutral' })
    expect(statusOf({ owner_party: 'date', due_at: at('2026-12-15T18:00:00') }, 'week', now)).toEqual({ label: 'Due 15 Dec', tone: 'neutral' })
  })
})
