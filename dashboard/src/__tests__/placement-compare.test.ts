/**
 * The comparison the client reads is built here from stored figures, never by the model, and the
 * client's pick is matched back to a quote here. Pinned: what goes in the table, what a partial
 * comparison says is still to come, how a pick resolves, and the HTML a pipe table becomes.
 */
import { describe, it, expect } from 'vitest'
import { derivePositions } from '@/lib/placement/position'
import { bodyToHtml, comparisonBody, comparisonTable, emailLines, optionLabel, resolvePick, sharedOn } from '@/lib/placement/compare'
import { lineStage } from '@/lib/placement/grid'
import type { Placement, PlacementBundle, PlacementDispatch, PlacementLine, PlacementQuote, PlacementRound, PlacementShare, PlacementTier } from '@/lib/placement/types'

const NOW = new Date('2026-10-29T04:00:00Z')
const T = NOW.toISOString()
const placement: Placement = {
  id: 'p1', ref: 'Q-0142', company_id: 'c1', title: 'GHS', client_thread_id: null, client_contact_id: null,
  status: 'open', inception_date: '2026-12-01', notes: null, created_by: null, created_at: T, updated_at: T,
}
const line = (over: Partial<PlacementLine> = {}): PlacementLine => ({
  id: 'L', placement_id: 'p1', product_line: 'group_health', label: 'GHS', spec: { limit: '500k' }, status: 'quoting',
  current_round_id: 'R', next_step: null, sort: 0, created_at: T, updated_at: T, ...over,
})
const round: PlacementRound = { id: 'R', placement_id: 'p1', line_id: 'L', round_no: 1, spec: { limit: '500k' }, change_summary: null, reason: 'initial', source_message_id: null, opened_by: null, opened_at: T, closed_at: null }
const dispatch = (id: string, insurer: string, over: Partial<PlacementDispatch> = {}): PlacementDispatch => ({
  id, placement_id: 'p1', line_id: 'L', round_id: 'R', company_id: 'c1', insurer_company_id: null, insurer_name: insurer, insurer_contact_id: null,
  to_email: 'uw@x.example', ai_draft_id: null, thread_id: null, gmail_thread_id: null, status: 'quoted', sent_at: T, last_outbound_at: T,
  last_inbound_at: null, next_chase_at: null, chase_count: 0, created_at: T, updated_at: T, ...over,
})
const quote = (id: string, dispatchId: string, amount: number, over: Partial<PlacementQuote> = {}): PlacementQuote => ({
  id, placement_id: 'p1', line_id: 'L', round_id: 'R', dispatch_id: dispatchId, insurer_name: 'X', premium_text: `S$${amount}`, premium_amount: amount,
  currency: 'SGD', limit_text: null, limit_amount: null, excess_text: null, validity_text: null, valid_until: '2026-11-30', key_terms: [], exclusions: [],
  subjectivities: [], summary: null, evidence: {}, source_message_id: null, thread_id: null, status: 'received', needs_review: false,
  extracted_by: 'agent', created_at: T, ...over,
})
const tier = (id: string, label: string, over: Partial<PlacementTier> = {}): PlacementTier => ({
  id, placement_id: 'p1', line_id: 'L', label, spec: {}, target_premium: null, status: 'asked', source: 'client', source_message_id: null,
  created_by: null, asked_at: T, sort: 0, created_at: T, ...over,
})
const positions = (b: Partial<PlacementBundle>) => derivePositions({ placements: [placement], lines: [line()], rounds: [round], dispatches: [], quotes: [], tiers: [], log: [], ...b }, NOW)

const world = () => positions({
  dispatches: [dispatch('d1', 'MSIG', { insurer_product_name: 'GHS Prime' }), dispatch('d2', 'Allianz', { insurer_product_name: 'Care Plus' }), dispatch('d3', 'Etiqa', { status: 'sent' }), dispatch('d4', 'HL', { status: 'declined' })],
  quotes: [
    quote('q1', 'd1', 36800, { premium_per_head_amount: 800, key_terms: ['1-bed private', 'No GP'] }),
    quote('q2', 'd1', 46920, { tier_id: 't1' }),
    quote('q3', 'd2', 38870),
    quote('q4', 'd2', 45540, { tier_id: 't1' }),
    quote('q5', 'd2', 50000, { tier_id: 't2', valid_until: '2026-10-01' }),   // expired: never emailed
  ],
  tiers: [tier('t1', '1M'), tier('t2', '2M', { sort: 1, status: 'offered', source: 'insurer' })],
})

describe('emailLines', () => {
  it('lists every current price, names insurer and product, and says who is still pricing what', () => {
    const [l] = emailLines(world(), null, NOW)
    expect(l.quotes.map(q => q.quote.id)).toEqual(['q3', 'q4', 'q1', 'q2'])
    expect(l.quotes[0]).toMatchObject({ insurer: 'Allianz', product: 'Care Plus' })
    expect(l.pending).toEqual(['Etiqa'])
    expect(l.declined).toEqual(['HL'])
  })
  it('keeps only the ticked prices for a partial comparison', () => {
    const [l] = emailLines(world(), new Set(['q1']), NOW)
    expect(l.quotes.map(q => q.quote.id)).toEqual(['q1'])
  })
  it('names an insurer that priced the base but not an asked option as still to come for it', () => {
    const p = positions({ dispatches: [dispatch('d1', 'MSIG')], quotes: [quote('q1', 'd1', 100)], tiers: [tier('t1', '1M'), tier('t2', '2M', { sort: 1 })] })
    expect(emailLines(p, null, NOW)[0].pending).toEqual(['MSIG (1M, 2M)'])
  })
})

describe('comparisonTable and comparisonBody', () => {
  it('writes one pipe row per price with the figures as stored and blanks left blank', () => {
    const [l] = emailLines(world(), new Set(['q1', 'q2']), NOW)
    const rows = comparisonTable(l).split('\n')
    expect(rows[0]).toBe('| Insurer · plan | Option | Premium (S$) | Per head (S$) | Limit | Excess | Valid until | Key benefits |')
    expect(rows).toHaveLength(3)
    expect(rows.some(r => r.startsWith('| MSIG · GHS Prime | 500k | 36,800.00 | 800.00 |  |  | 30 Nov 2026 | 1-bed private; No GP |'))).toBe(true)
    expect(rows.some(r => r.includes('| 1M | 46,920.00 |'))).toBe(true)
  })
  it('puts the opening, each line with its table and what is to come, then the differences and the close', () => {
    const body = comparisonBody({ opening: 'Dear Ms Tan,', differences: 'Allianz 1M is lowest.', closing: 'Please reply with your choice.' }, emailLines(world(), null, NOW))
    const blocks = body.split('\n\n')
    expect(blocks[0]).toBe('Dear Ms Tan,')
    expect(blocks[1]).toBe('GHS')
    expect(blocks[2].startsWith('| Insurer · plan')).toBe(true)
    expect(blocks[3]).toBe('Still to come: Etiqa. Declined: HL.')
    expect(blocks.slice(-2)).toEqual(['Allianz 1M is lowest.', 'Please reply with your choice.'])
  })
})

describe('resolvePick', () => {
  it('matches insurer and option to the one quote', () => {
    expect(resolvePick(world(), { line_label: 'GHS', insurer: 'Allianz', option: '1M' })?.quote.id).toBe('q4')
    expect(resolvePick(world(), { line_label: 'ghs', insurer: 'msig', option: '500k' })?.quote.id).toBe('q1')
  })
  it('takes the only quote when no option is named, and refuses when several could be meant', () => {
    const one = positions({ dispatches: [dispatch('d1', 'MSIG')], quotes: [quote('q1', 'd1', 100)] })
    expect(resolvePick(one, { line_label: 'GHS', insurer: 'MSIG', option: null })?.quote.id).toBe('q1')
    expect(resolvePick(world(), { line_label: 'GHS', insurer: 'MSIG', option: null })).toBeNull()
  })
  it('refuses an insurer that was not asked or an option it did not price', () => {
    expect(resolvePick(world(), { line_label: 'GHS', insurer: 'AIA', option: '1M' })).toBeNull()
    expect(resolvePick(world(), { line_label: 'GHS', insurer: 'MSIG', option: '2M' })).toBeNull()
  })
  it('labels a base quote by its limit', () => {
    const p = world()[0]
    expect(optionLabel(p, p.dispatches[0].quotes.find(q => !q.tier_id)!)).toBe('500k')
  })
})

describe('sharedOn', () => {
  it('gives the latest sent date per quote and ignores drafts', () => {
    const s = (id: string, status: PlacementShare['status'], sent_at: string | null, quote_ids: string[]): PlacementShare =>
      ({ id, placement_id: 'p1', company_id: 'c1', ai_draft_id: null, quote_ids, subject: null, body: null, status, sent_at, sent_by: null, sent_from: null, created_by: null, created_at: T })
    const m = sharedOn([s('a', 'sent', '2026-10-28T01:00:00Z', ['q1']), s('b', 'sent', '2026-10-29T01:00:00Z', ['q1', 'q2']), s('c', 'drafted', null, ['q3'])])
    expect(m.get('q1')).toBe('2026-10-29T01:00:00Z')
    expect(m.has('q3')).toBe(false)
  })
})

describe('bodyToHtml', () => {
  it('turns a block of pipe rows into a table and the rest into paragraphs', () => {
    const html = bodyToHtml('Dear Ms Tan,\n\n| A | B |\n| 1 | <2> |\n\nThanks')
    expect(html.startsWith('<p>Dear Ms Tan,</p><table')).toBe(true)
    expect(html).toContain('<th style="')
    expect(html).toContain('>&lt;2&gt;</td>')
    expect(html.endsWith('<p>Thanks</p>')).toBe(true)
  })
  it('drops a markdown separator row and leaves a lone pipe line as text', () => {
    expect(bodyToHtml('| A | B |\n|---|---|\n| 1 | 2 |')).not.toContain('---')
    expect(bodyToHtml('| just one |')).toBe('<p>| just one |</p>')
  })
})

describe('lineStage through bind', () => {
  const at = (over: Partial<PlacementLine>) => lineStage(positions({ lines: [line(over)], dispatches: [dispatch('d1', 'MSIG')], quotes: [quote('q1', 'd1', 1)] })[0], placement)
  it('follows client chose → confirming → insurer confirmed', () => {
    expect(at({ client_confirmed_at: T })).toEqual({ stage: 'client_chose', waitingOn: 'broker' })
    expect(at({ status: 'bound', client_confirmed_at: T, confirm_sent_at: T })).toEqual({ stage: 'confirming', waitingOn: 'insurer' })
    expect(at({ status: 'bound', client_confirmed_at: T, confirm_sent_at: T, insurer_confirmed_at: T })).toEqual({ stage: 'dn_due', waitingOn: 'broker' })
    expect(at({ status: 'done', done_at: T, insurer_confirmed_at: T }).stage).toBe('done')
  })
})
