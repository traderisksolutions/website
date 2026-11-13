import { describe, it, expect } from 'vitest'
import { ownText, partyOf, emailDraft, rebuiltDraft, policyDrafts, debitNoteDraft, claimDraft, caseEventDraft, factReadable, factReader, links, ledgerKey, SUMMARY_MAX } from '../shape'
import { searchTerm } from '../retrieve'

const domains = new Map([['insurer.example', 'insurer'], ['client.example', 'client'], ['tpa.example', 'tpa'], ['broker.example', 'partner']])

describe('partyOf', () => {
  it('reads TRS, insurers, clients, TPAs and partners from the domain', () => {
    expect(partyOf('Ann <ann@trade-risksol.com>', domains)).toBe('internal')
    expect(partyOf('claims@insurer.example', domains)).toBe('insurer')
    expect(partyOf('hr@client.example', domains)).toBe('client')
    expect(partyOf('case@tpa.example', domains)).toBe('tpa')
    expect(partyOf('ops@broker.example', domains)).toBe('partner')
  })
  it('marks automated senders before looking at the domain', () => {
    expect(partyOf('noreply@insurer.example', domains)).toBe('automated')
  })
  it('treats a personal address on a client thread as the client, and elsewhere as other', () => {
    expect(partyOf('someone@gmail.com', domains, 'client')).toBe('client')
    expect(partyOf('someone@gmail.com', domains, 'insurer')).toBe('other')
    expect(partyOf('', domains)).toBe('other')
  })
})

describe('ownText', () => {
  it('drops quoted history and keeps the new text', () => {
    const body = 'Please renew the policy.\n\nOn Mon, 3 Nov 2026 at 10:00, Ann <ann@trade-risksol.com> wrote:\n> Your policy expires soon.'
    const t = ownText(body, 'Renewal')!
    expect(t).toContain('Please renew the policy.')
    expect(t).not.toContain('expires soon')
  })
  it('trims long text with an ellipsis and returns null for empty bodies', () => {
    expect(ownText('x'.repeat(5000))!.length).toBe(SUMMARY_MAX)
    expect(ownText('x'.repeat(5000))!.endsWith('…')).toBe(true)
    expect(ownText(null)).toBeNull()
    expect(ownText('   ')).toBeNull()
  })
})

describe('emailDraft', () => {
  const m = { id: 'm1', thread_id: 't1', gmail_message_id: 'abc', direction: 'inbound', from_address: 'HR <hr@client.example>', subject: 'Claim form', body_text: 'Attached the claim form for our worker.', sent_at: '2026-11-01T02:00:00Z' }
  it('logs an inbound client email with links to the thread, Gmail and filed documents', () => {
    const d = emailDraft(m, { domainKind: domains, docs: [{ filename: 'Claim.pdf', drive_url: 'https://drive.google.com/file/d/x/view' }], policyId: 'p1' })
    expect(d.kind).toBe('email_in')
    expect(d.party).toBe('client')
    expect(d.actor).toBe('hr@client.example')
    expect(d.policy_id).toBe('p1')
    expect(d.links.map(l => l.label)).toEqual(['Email thread', 'Gmail', 'Claim.pdf'])
    expect(d.links[0].url).toBe('/engagement?thread=t1')
    expect(d.source_table).toBe('email_messages')
    expect(d.source_id).toBe('m1')
  })
  it('logs TRS mail as outgoing even when the direction field is missing', () => {
    expect(emailDraft({ ...m, direction: null, from_address: 'ops@trade-risksol.com' }, { domainKind: domains }).kind).toBe('email_out')
  })
  it('names an empty subject', () => {
    expect(emailDraft({ ...m, subject: '' }, { domainKind: domains }).title).toBe('(no subject)')
  })
})

describe('other sources', () => {
  it('marks rebuilt mail as rebuilt, never as received', () => {
    const d = rebuiltDraft({ id: 'r1', thread_id: 't1', origin: 'forward', subject: 'Damage', body_text: 'Water leak', from_address: 'hr@client.example', sent_at: null, created_at: '2026-11-01T00:00:00Z' }, { domainKind: domains, fallbackDate: '2026-10-20T00:00:00Z' })
    expect(d.kind).toBe('email_rebuilt')
    expect(d.title).toContain('rebuilt from a forward')
    expect(d.occurred_at).toBe('2026-10-20T00:00:00Z')
  })
  it('logs a policy start, and its end only once the date has passed', () => {
    const p = { id: 'p1', class_of_insurance: 'WICA', insurer: 'AIA', policy_number: 'W1', start_date: '2026-01-01', end_date: '2026-12-31', drive_folder_url: 'https://drive.google.com/drive/folders/f' }
    expect(policyDrafts(p, '2026-11-02').map(d => d.source_id)).toEqual(['p1:start'])
    expect(policyDrafts(p, '2027-01-02').map(d => d.source_id)).toEqual(['p1:start', 'p1:end'])
    expect(policyDrafts(p, '2026-11-02')[0].links[0].label).toBe('Policy folder')
  })
  it('names credit notes and debit notes apart', () => {
    expect(debitNoteDraft({ id: 'd', debit_note_no: 'CN250201', gross_amount: 6443.31, currency: 'SGD', issue_date: '2025-02-01' }).title).toBe('Credit note CN250201 · SGD 6,443.31')
    expect(debitNoteDraft({ id: 'd', debit_note_no: 'DN260207', issue_date: '2026-02-07' }).title).toBe('Debit note DN260207')
  })
  it('links claims and case events to their pages', () => {
    expect(claimDraft({ id: 'c1', class: 'wica', insurer_name: 'AIA', claimant: 'B. R.', created_at: '2026-11-01T00:00:00Z' }).links[0].url).toBe('/claims?claim=c1')
    const e = caseEventDraft({ id: 'e1', work_item_id: 'w1', kind: 'status', actor: 'ann@trade-risksol.com', detail: { status: 'waiting_insurer' }, created_at: '2026-11-01T00:00:00Z' }, { title: 'Claim', policy_id: null })
    expect(e.title).toBe('Claim · status')
    expect(e.summary).toBe('waiting_insurer')
    expect(e.party).toBe('internal')
  })
})

describe('factReadable', () => {
  const e = { kind: 'email_in', party: 'client', actor: 'hr@client.example', summary: 'Our claims are handled by Jane Tan, HR manager, on 6123 4567.', title: 'Contacts' }
  it('reads a client or an insurer writing in, under the client only', () => {
    expect(factReader(e, 'client')).toBe('client')
    expect(factReadable(e, 'insurer')).toBe(false)
    expect(factReadable(e, 'partner')).toBe(false)
    expect(factReader({ ...e, party: 'insurer', actor: 'uw@insurer.example' }, 'client')).toBe('insurer')
    expect(factReadable({ ...e, party: 'partner' }, 'client')).toBe(false)
    expect(factReadable({ ...e, kind: 'email_out' }, 'client')).toBe(false)
    expect(factReadable({ ...e, actor: 'noreply@client.example' }, 'client')).toBe(false)
  })
  it('skips newsletters and very short notes', () => {
    expect(factReadable({ ...e, summary: e.summary + ' Click to unsubscribe.' }, 'client')).toBe(false)
    expect(factReadable({ ...e, summary: 'Thanks!' }, 'client')).toBe(false)
  })
})

describe('helpers', () => {
  it('drops empty and repeated links', () => {
    expect(links({ label: 'a', url: 'u' }, null, { label: 'b', url: 'u' }, { label: 'c', url: '' })).toEqual([{ label: 'a', url: 'u' }])
  })
  it('keys a row by source and company', () => {
    expect(ledgerKey('email_messages', 'm1', 'c1')).toBe('email_messages:m1:c1')
  })
  it('strips characters PostgREST filters cannot take', () => {
    expect(searchTerm('claim (AIA), 50%*')).toBe('claim AIA 50')
  })
})
