import { describe, it, expect } from 'vitest'
import { bucketOf, buildBuckets, proposeThreads, matterWords, sideOfThread, type SourceMessage, type Candidate, type Side } from '../sources'

const kinds = new Map([['client.invalid', 'client'], ['insurer.invalid', 'insurer'], ['tpa.invalid', 'tpa']])
const msg = (o: Partial<SourceMessage> & { id: string; thread_id: string }): SourceMessage => ({
  direction: 'inbound', from_address: 'hr@client.invalid', subject: 'Renewal', body_text: 'Please renew on the same terms.', sent_at: '2026-11-01T02:00:00Z', ...o,
})

describe('sideOfThread', () => {
  it('reads the side from the company the thread is filed under', () => {
    expect(sideOfThread({ company_id: 'c1', companyKind: 'client', named: false }, 'c1')).toBe('client')
    expect(sideOfThread({ company_id: 'i1', companyKind: 'insurer', named: true }, 'c1')).toBe('insurer')
    expect(sideOfThread({ company_id: 'p1', companyKind: 'partner', named: true }, 'c1')).toBe('insurer')
    expect(sideOfThread({ company_id: null, companyKind: null, named: false }, 'c1')).toBe('other')
  })
})

describe('bucketOf', () => {
  it('places an outside message by its sender', () => {
    expect(bucketOf(msg({ id: 'm1', thread_id: 't1' }), 'insurer', kinds)).toBe('client')
    expect(bucketOf(msg({ id: 'm2', thread_id: 't1', from_address: 'Underwriter <uw@insurer.invalid>' }), 'client', kinds)).toBe('insurer')
    expect(bucketOf(msg({ id: 'm3', thread_id: 't1', from_address: 'care@tpa.invalid' }), 'other', kinds)).toBe('insurer')
  })
  it('places an unknown sender by the thread', () => {
    expect(bucketOf(msg({ id: 'm1', thread_id: 't1', from_address: 'someone@gmail.com' }), 'client', kinds)).toBe('client')
    expect(bucketOf(msg({ id: 'm2', thread_id: 't1', from_address: 'someone@elsewhere.invalid' }), 'insurer', kinds)).toBe('insurer')
    expect(bucketOf(msg({ id: 'm3', thread_id: 't1', from_address: 'someone@elsewhere.invalid' }), 'other', kinds)).toBeNull()
  })
  it('places a TRS message by the thread, then by who it was sent to', () => {
    const out = { direction: 'outbound', from_address: 'nathan@trade-risksol.com' }
    expect(bucketOf(msg({ id: 'm1', thread_id: 't1', ...out }), 'insurer', kinds)).toBe('insurer')
    expect(bucketOf(msg({ id: 'm2', thread_id: 't1', ...out, to: ['hr@client.invalid'] }), 'other', kinds)).toBe('client')
    expect(bucketOf(msg({ id: 'm3', thread_id: 't1', ...out, to: ['hr@client.invalid'], cc: ['uw@insurer.invalid'] }), undefined, kinds)).toBe('insurer')
    expect(bucketOf(msg({ id: 'm4', thread_id: 't1', ...out }), 'other', kinds)).toBeNull()
  })
})

describe('buildBuckets', () => {
  const sides = new Map<string, Side>([['t1', 'client'], ['t2', 'insurer']])
  const messages = [
    msg({ id: 'm3', thread_id: 't2', from_address: 'uw@insurer.invalid', body_text: 'Our terms are attached.', sent_at: '2026-11-03T02:00:00Z', files: ['Quotation.pdf'] }),
    msg({ id: 'm1', thread_id: 't1', sent_at: '2026-11-01T02:00:00Z' }),
    msg({ id: 'm2', thread_id: 't2', direction: 'outbound', from_address: 'nathan@trade-risksol.com', to: ['uw@insurer.invalid'], body_text: 'Please quote for renewal.', sent_at: '2026-11-02T02:00:00Z' }),
    msg({ id: 'm4', thread_id: 't1', subject: 'Automatic reply: Renewal', body_text: 'I am out of office until Monday.', sent_at: '2026-11-04T02:00:00Z' }),
    msg({ id: 'm5', thread_id: 't1', direction: 'outbound', from_address: 'nathan@trade-risksol.com', to: ['cheng@trade-risksol.com'], body_text: 'FYI', sent_at: '2026-11-05T02:00:00Z' }),
    msg({ id: 'm6', thread_id: 't9', sent_at: '2026-11-06T02:00:00Z', from_address: 'x@elsewhere.invalid' }),
  ]
  const b = buildBuckets(messages, sides, kinds)
  it('splits by side in date order', () => {
    expect(b.client.map(s => s.message_id)).toEqual(['m1'])
    expect(b.insurer.map(s => s.message_id)).toEqual(['m2', 'm3'])
  })
  it('leaves out auto-replies, TRS-only messages and messages with no side', () => {
    const all = [...b.client, ...b.insurer].map(s => s.message_id)
    for (const id of ['m4', 'm5', 'm6']) expect(all).not.toContain(id)
  })
  it('shows the message without its sign-off, signature and the history beneath', () => {
    const body = ['Hi Nathan,', '', 'Please renew on the same terms.', '', 'Warmest Regards,', 'Jane Tan', 'HR Manager', '+65 6000 0000', '', 'On Mon, 2 Nov 2026 at 10:15, Nathan <nathan@trade-risksol.com> wrote:', '> Shall we renew?'].join('\n')
    const one = buildBuckets([msg({ id: 'm7', thread_id: 't1', body_text: body })], sides, kinds)
    expect(one.client[0].text).toBe('Hi Nathan,\n\nPlease renew on the same terms.')
  })
  it('keeps who wrote, the files and the email it opens', () => {
    expect(b.insurer[0]).toMatchObject({ by: 'trs', from: 'nathan@trade-risksol.com', href: '/engagement?thread=t2' })
    expect(b.insurer[1]).toMatchObject({ by: 'them', from: 'uw@insurer.invalid', files: ['Quotation.pdf'], text: 'Our terms are attached.' })
  })
})

describe('proposeThreads', () => {
  const today = '2026-11-15'
  const c = { id: 'w1', case_type: 'renewal', title: 'Group hospital renewal 2027 Acme Logistics', policy_number: 'GHS-12345' }
  const t = (o: Partial<Candidate> & { id: string }): Candidate => ({ subject: 'Hello', last_message_at: '2026-11-10T00:00:00Z', label: 'other', side: 'client', onCase: null, ...o })
  const candidates = [
    t({ id: 'label', subject: 'Renewal terms', label: 'quote_received', last_message_at: '2026-11-12T00:00:00Z' }),
    t({ id: 'policy', subject: 'RE: Policy GHS 12345 census', last_message_at: '2026-10-01T00:00:00Z' }),
    t({ id: 'subject', subject: 'Acme Logistics hospital plan options' }),
    t({ id: 'marine', subject: 'Marine cargo declaration', label: 'other' }),
    t({ id: 'old', subject: 'Renewal 2026 group hospital Acme Logistics', label: 'renewal', last_message_at: '2026-07-01T00:00:00Z' }),
    t({ id: 'picked', subject: 'Renewal terms', label: 'renewal' }),
    t({ id: 'excluded', subject: 'Renewal of GHS-12345', label: 'renewal' }),
    t({ id: 'elsewhere', subject: 'Claim for Tan', label: 'claim', onCase: { id: 'w2', title: 'Claim: Tan' } }),
  ]
  const p = proposeThreads(c, candidates, new Set(['picked', 'excluded']), today)
  it('proposes by policy number, then subject, then label', () => {
    expect(p.proposed.map(x => [x.id, x.reason])).toEqual([['policy', 'policy_number'], ['subject', 'subject'], ['label', 'label']])
    expect(p.proposed[1].basis).toBe('Subject shares: acme, logistics, hospital')
  })
  it('never offers a picked or excluded thread', () => {
    const all = [...p.proposed, ...p.recent, ...p.older].map(x => x.id)
    expect(all).not.toContain('picked'); expect(all).not.toContain('excluded')
  })
  it('lists the rest of the last 90 days apart, with the case that holds a thread', () => {
    expect(p.recent.map(x => x.id)).toEqual(['marine', 'elsewhere'])
    expect(p.recent[1].onCase).toEqual({ id: 'w2', title: 'Claim: Tan' })
  })
  it('never proposes a thread older than 90 days, whatever it matches', () => {
    expect(p.older.map(x => x.id)).toEqual(['old'])
  })
  it('orders each group by closeness to the case, and keeps the groups', () => {
    const more = [...candidates, t({ id: 'label2', subject: 'Quotation', label: 'quotation_request', last_message_at: '2026-11-01T00:00:00Z' }), t({ id: 'crane', subject: 'Crane inspection', last_message_at: '2026-11-14T00:00:00Z' })]
    const s = proposeThreads(c, more, new Set(['picked', 'excluded']), today, new Map([['label2', 0.9], ['label', 0.6], ['policy', 0.2], ['elsewhere', 0.8], ['marine', 0.5]]))
    expect(s.proposed.map(x => x.id)).toEqual(['policy', 'subject', 'label2', 'label'])
    expect(s.recent.map(x => x.id)).toEqual(['elsewhere', 'marine', 'crane'])
    expect(s.older.map(x => x.id)).toEqual(['old'])
  })
  it('does not match on form words alone', () => {
    expect([...matterWords('RE: Renewal of Group Policy 2027')]).toEqual(['2027'])
    const q = proposeThreads({ ...c, title: 'Renewal quotation request', policy_number: null, case_type: 'other' }, [t({ id: 'a', subject: 'Renewal quotation request for another client' })], new Set(), today)
    expect(q.proposed).toEqual([])
  })
})
