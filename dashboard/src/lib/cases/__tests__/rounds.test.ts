import { describe, it, expect } from 'vitest'
import { buildRounds, clientMove, insurerMove, recipientFor, type Call, type RoundsInput } from '../rounds'
import { indexNames } from '@/lib/crm/party-read'
import type { Side, SourceMessage } from '../sources'

const TRS = 'nathan@trade-risksol.com'
const domainKind = new Map([['orchard-foods.example', 'client'], ['harbour-insurance.example', 'insurer'], ['pier-assurance.example', 'insurer']])
const insurers: Record<string, string> = { 'harbour-insurance.example': 'Harbour Insurance', 'pier-assurance.example': 'Pier Assurance' }
const domainOf = (a: string | null | undefined) => String(a ?? '').split('@')[1]?.replace(/>$/, '') ?? ''
const insurerName = (a: string | null | undefined) => insurers[domainOf(a)] ?? null
const sides = new Map<string, Side>([['tc', 'client'], ['th', 'insurer'], ['tp', 'insurer']])
const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T02:00:00Z`
const msg = (o: Partial<SourceMessage> & { id: string; thread_id: string; sent_at: string }): SourceMessage => ({ direction: 'inbound', from_address: 'hr@orchard-foods.example', subject: 'Group hospital quotation', body_text: '', ...o })
const ours = (o: Partial<SourceMessage> & { id: string; thread_id: string; sent_at: string; to: string[] }): SourceMessage => msg({ direction: 'outbound', from_address: TRS, ...o })
const input = (messages: SourceMessage[], o: Partial<RoundsInput> = {}): RoundsInput => ({
  messages, sides, sideSet: new Set(), visible: new Set(['tc', 'th', 'tp']), domainKind, insurerName, companyName: () => null,
  names: indexNames([]), threadInsurer: new Map(), caseType: 'new_quote', set: new Map<string, Call>(), ...o,
})

const request = msg({ id: 'c1', thread_id: 'tc', sent_at: at(1), body_text: 'Hi Nathan,\n\nWe would like a quotation for group hospital and surgical insurance for our 25 staff. The census is attached.', files: ['census.xlsx'] })
const askHarbour = ours({ id: 'h1', thread_id: 'th', sent_at: at(2), to: ['uw@harbour-insurance.example'], body_text: 'Hi,\n\nPlease let us have your quotation for group hospital and surgical cover for our client on the attached census. Cover is to start on 1 January 2027.', files: ['census.xlsx'] })
const askPier = ours({ id: 'p1', thread_id: 'tp', sent_at: at(2), to: ['quotes@pier-assurance.example'], body_text: 'Hi,\n\nPlease let us have your quotation for group hospital and surgical cover for our client on the attached census. Cover is to start on 1 January 2027.', files: ['census.xlsx'] })
const harbourQuote = msg({ id: 'h2', thread_id: 'th', sent_at: at(4), from_address: 'uw@harbour-insurance.example', to: [TRS], cc: ['team@harbour-insurance.example', 'quotes@pier-assurance.example'], body_text: 'Hi Nathan,\n\nPlease find attached our quotation for your client. The annual premium is $12,400.', files: ['Harbour quotation.pdf'] })
const toClient = ours({ id: 'c2', thread_id: 'tc', sent_at: at(5), to: ['hr@orchard-foods.example'], body_text: 'Hi,\n\nPlease find attached the quotation from Harbour Insurance. The annual premium is $12,400.', files: ['Harbour quotation.pdf'] })
const change = msg({ id: 'c3', thread_id: 'tc', sent_at: at(7), cc: ['finance@orchard-foods.example', 'uw@harbour-insurance.example'], body_text: 'Hi Nathan,\n\nPlease requote with dental added, and remove the GP rider.' })
const firstRound = [request, askHarbour, askPier, harbourQuote, toClient]

describe('one email, one move', () => {
  it('reads a conditional refusal as a question, a plain one as a decline', () => {
    const refuse = (body_text: string) => insurerMove(msg({ id: 'x', thread_id: 'th', sent_at: at(3), from_address: 'uw@harbour-insurance.example', body_text }), 'new_quote').move
    expect(refuse('We regret that we are unable to quote on this risk.')).toBe('decline')
    expect(refuse('We are unable to quote unless we receive the claims experience for the last three years.')).toBe('question')
  })
  it('reads an award as the client’s instruction, whatever is attached', () => {
    const m = msg({ id: 'x', thread_id: 'tc', sent_at: at(9), body_text: 'We are pleased to confirm the award of the insurance to Harbour Insurance. The updated census is attached.', files: ['census.xlsx'] })
    expect(clientMove(m, 'new_quote').move).toBe('decision')
  })
  it('reads an insurer’s acknowledgement as a message, a signature picture as no document', () => {
    const m = msg({ id: 'x', thread_id: 'th', sent_at: at(3), from_address: 'uw@harbour-insurance.example', body_text: 'Thank you for this enquiry. We will review and revert.', files: ['image001.png'] })
    expect(insurerMove(m, 'new_quote').move).toBe('note')
  })
})

describe('rounds', () => {
  it('keeps one round while the request stands: asked, replied, sent to client', () => {
    const r = buildRounds(input(firstRound))
    expect(r.rounds).toHaveLength(1)
    expect(r.rounds[0].opened_by).toBe('c1')
    expect(r.rounds[0].moves.map(m => [m.message_id, m.by, m.move])).toEqual([
      ['c1', 'client', 'ask'], ['h1', 'trs', 'request'], ['p1', 'trs', 'request'], ['h2', 'insurer', 'quote'], ['c2', 'trs', 'relay'],
    ])
    expect(r.rounds[0].chains.map(c => [c.insurer, c.state])).toEqual([['Harbour Insurance', 'sent'], ['Pier Assurance', 'asked']])
    expect(r.steps.map(s => [s.act, s.text])).toEqual([['wait', 'Waiting on Pier Assurance']])
  })
  it('opens a round when the client changes the request: every insurer asked is owed the change', () => {
    const r = buildRounds(input([...firstRound, change]))
    expect(r.rounds.map(x => [x.n, x.opened_by])).toEqual([[1, 'c1'], [2, 'c3']])
    expect(r.rounds[1].chains.map(c => [c.insurer, c.state])).toEqual([['Harbour Insurance', 'to_ask'], ['Pier Assurance', 'to_ask']])
    expect(r.steps.map(s => [s.id, s.act, s.agent, s.draft, s.text])).toEqual([
      ['change:c3:Harbour Insurance', 'draft', 'Insurer agent', 'forward_change', "Send the client's change to Harbour Insurance for revised terms"],
      ['change:c3:Pier Assurance', 'draft', 'Insurer agent', 'forward_change', "Send the client's change to Pier Assurance for revised terms"],
    ])
  })
  it('clears an insurer’s step when TRS writes to it, and keeps only the newest change', () => {
    const sent = ours({ id: 'h3', thread_id: 'th', sent_at: at(8), to: ['uw@harbour-insurance.example'], body_text: 'Hi,\n\nOur client has revised their request: please requote with dental added and without the GP rider. The census is unchanged.' })
    const again = msg({ id: 'c4', thread_id: 'tc', sent_at: at(9), body_text: 'Sorry, one more change: please increase the ward to a single room instead of four-bedded.' })
    expect(buildRounds(input([...firstRound, change, sent])).steps.map(s => s.id)).toEqual(['change:c3:Pier Assurance', 'waiting::Harbour Insurance'])
    const r = buildRounds(input([...firstRound, change, sent, again]))
    expect(r.rounds).toHaveLength(3)
    expect(r.steps.map(s => s.id)).toEqual(['change:c4:Harbour Insurance', 'change:c4:Pier Assurance'])
  })
  it('takes an insurer the client drops out of the change', () => {
    const drop = msg({ id: 'c3', thread_id: 'tc', sent_at: at(7), body_text: 'Please disregard Pier Assurance. For the other, please requote with dental added.' })
    expect(buildRounds(input([...firstRound, drop])).steps.map(s => s.id)).toEqual(['change:c3:Harbour Insurance'])
  })
  it('owes the client an insurer’s reply until TRS passes it on', () => {
    const r = buildRounds(input([request, askHarbour, harbourQuote]))
    expect(r.steps.map(s => [s.id, s.act, s.to, s.agent, s.draft])).toEqual([['quote:h2:Harbour Insurance', 'draft', 'client', 'Client agent', 'relay_quote']])
    expect(r.rounds[0].chains[0].state).toBe('replied')
  })
  it('asks for the market on a request no insurer has seen, until terms reach the client another way', () => {
    expect(buildRounds(input([request])).steps.map(s => [s.id, s.act, s.text])).toEqual([['ask:c1:', 'ask', 'Ask insurers for terms']])
    const direct = ours({ id: 'c2', thread_id: 'tc', sent_at: at(5), to: ['hr@orchard-foods.example'], body_text: 'Hi,\n\nPlease find attached the quotation we received from the insurer.', files: ['Quotation.pdf'] })
    expect(buildRounds(input([request, direct])).steps.some(s => s.what === 'ask')).toBe(false)
  })
  it('reads a few words that ask for terms as a request, a bare acknowledgement as a message', () => {
    const short = (body_text: string) => buildRounds(input([request, ours({ id: 'h1', thread_id: 'th', sent_at: at(2), to: ['uw@harbour-insurance.example'], body_text })]))
    const asked = short('Please quote the renewal on the expiring terms.')
    expect(asked.rounds[0].moves[1].move).toBe('request')
    expect(asked.rounds[0].chains[0].state).toBe('asked')
    expect(asked.steps.map(s => s.id)).toEqual(['waiting::Harbour Insurance'])
    const noted = short('Noted with thanks.')
    expect(noted.rounds[0].moves[1].move).toBe('note')
    expect(noted.steps.map(s => s.id)).toEqual(['ask:c1:'])
  })
  it('takes a person’s call on an email over the rule, and keeps the rule’s reading', () => {
    const r = buildRounds(input([request, askHarbour, harbourQuote], { set: new Map<string, Call>([['h2', { by: 'insurer', move: 'question' }]]) }))
    expect(r.rounds[0].moves.find(m => m.message_id === 'h2')).toMatchObject({ move: 'question', rule: 'quote', set_by: 'person' })
    expect(r.steps.map(s => s.id)).toEqual(['question:h2:Harbour Insurance'])
  })
  it('withholds the words of an email in a colleague’s mailbox', () => {
    const r = buildRounds(input(firstRound, { visible: new Set(['tc', 'tp']) }))
    expect(r.rounds[0].moves.find(m => m.message_id === 'h2')).toMatchObject({ text: '', files: [], private: true, move: 'quote' })
  })
})

describe('a referral', () => {
  const partner = { id: 'co1', name: 'Carebridge', kind: 'partner' }
  it('writes for the client: its emails are the client’s, marked with its name', () => {
    const m = msg({ id: 'r1', thread_id: 'tr', sent_at: at(1), from_address: 'amy@carebridge.sg', body_text: 'Hi Nathan,\n\nOur client would like a quotation for group hospital and surgical insurance for 40 staff. Census attached.', files: ['census.xlsx'] })
    const r = buildRounds(input([m], { sides: new Map(), visible: new Set(['tr']), names: indexNames([partner]) }))
    expect(r.rounds[0].moves[0]).toMatchObject({ by: 'client', via: 'Carebridge', move: 'ask' })
    expect(r.referral).toBe('Carebridge')
  })
  it('is read from the signature of a personal address', () => {
    const m = msg({ id: 'r1', thread_id: 'tr', sent_at: at(1), from_address: 'amy.tan@gmail.com', body_text: 'Hi Nathan,\n\nPlease quote group hospital and surgical insurance for 40 staff. Census attached.\n\nBest regards,\nAmy Tan\nAccount Manager\nCarebridge Pte Ltd', files: ['census.xlsx'] })
    const r = buildRounds(input([m], { sides: new Map(), visible: new Set(['tr']), names: indexNames([partner]) }))
    expect(r.rounds[0].moves[0]).toMatchObject({ by: 'client', via: 'Carebridge' })
  })
  it('leaves a thread whose side a person set where they put it', () => {
    const m = msg({ id: 'r1', thread_id: 'tr', sent_at: at(1), from_address: 'amy@carebridge.sg', body_text: 'Please find attached our quotation for your client.', files: ['Quotation.pdf'] })
    const r = buildRounds(input([m], { sides: new Map<string, Side>([['tr', 'insurer']]), sideSet: new Set(['tr']), visible: new Set(['tr']), names: indexNames([partner]) }))
    expect(r.rounds[0].moves[0]).toMatchObject({ by: 'insurer', via: null })
  })
})

describe('who a step’s email goes to', () => {
  const messages = [...firstRound, change]
  const { rounds } = buildRounds(input(messages))
  const visible = new Set(['tc', 'th', 'tp'])
  it('goes to the insurer’s last writer, copying only their colleagues', () => {
    expect(recipientFor({ to: 'insurer', insurer: 'Harbour Insurance' }, rounds, messages, visible, domainKind))
      .toEqual({ to: 'uw@harbour-insurance.example', cc: ['team@harbour-insurance.example'], thread_id: 'th', message_id: 'h2' })
  })
  it('goes to whoever TRS asked when the insurer has not written', () => {
    expect(recipientFor({ to: 'insurer', insurer: 'Pier Assurance' }, rounds, messages, visible, domainKind))
      .toEqual({ to: 'quotes@pier-assurance.example', cc: [], thread_id: 'tp', message_id: 'p1' })
  })
  it('goes to the client’s last writer, copying no insurer', () => {
    expect(recipientFor({ to: 'client', insurer: 'Harbour Insurance' }, rounds, messages, visible, domainKind))
      .toEqual({ to: 'hr@orchard-foods.example', cc: ['finance@orchard-foods.example'], thread_id: 'tc', message_id: 'c3' })
  })
  it('names no one from a thread the viewer may not read', () => {
    expect(recipientFor({ to: 'insurer', insurer: 'Harbour Insurance' }, rounds, messages, new Set(['tc', 'tp']), domainKind)).toBeNull()
  })
})
