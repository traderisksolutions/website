/**
 * The comparison grid and the RFQ register read every cell from lib/placement/grid.ts. Pinned
 * here: which option columns show, what each insurer × option cell says, the lowest mark, and
 * where a line stands in the register.
 */
import { describe, it, expect } from 'vitest'
import { derivePositions } from '@/lib/placement/position'
import { cellState, gridOptions, lineGrid, lineStage, lowestByOption, registerCounts, registerRow } from '@/lib/placement/grid'
import type { Placement, PlacementBundle, PlacementDispatch, PlacementLine, PlacementQuote, PlacementRound, PlacementTier } from '@/lib/placement/types'

const NOW = new Date('2026-10-28T04:00:00Z')
const T = NOW.toISOString()

const placement: Placement = {
  id: 'p1', ref: 'Q-0142', company_id: 'c1', title: 'GHS for 46', client_thread_id: null, client_contact_id: null,
  status: 'open', inception_date: '2026-12-01', notes: null, created_by: 'jl@trade-risksol.com', created_at: '2026-10-27T02:00:00Z', updated_at: T,
}
const line = (over: Partial<PlacementLine> = {}): PlacementLine => ({
  id: 'L', placement_id: 'p1', product_line: 'group_health', label: 'GHS', spec: { limit: '500k' }, status: 'quoting',
  current_round_id: 'R', next_step: null, sort: 0, created_at: T, updated_at: T, ...over,
})
const round: PlacementRound = { id: 'R', placement_id: 'p1', line_id: 'L', round_no: 1, spec: { limit: '500k' }, change_summary: null, reason: 'initial', source_message_id: null, opened_by: null, opened_at: T, closed_at: null }
const dispatch = (id: string, insurer: string, over: Partial<PlacementDispatch> = {}): PlacementDispatch => ({
  id, placement_id: 'p1', line_id: 'L', round_id: 'R', company_id: 'c1', insurer_company_id: null, insurer_name: insurer, insurer_contact_id: null,
  to_email: `${insurer.toLowerCase()}@ins.example`, ai_draft_id: null, thread_id: null, gmail_thread_id: null, status: 'sent',
  sent_at: '2026-10-27T03:00:00Z', last_outbound_at: '2026-10-27T03:00:00Z', last_inbound_at: null, next_chase_at: '2026-11-30T00:00:00Z',
  chase_count: 0, sent_by: 'jl@trade-risksol.com', created_at: T, updated_at: T, ...over,
})
const quote = (id: string, dispatchId: string, amount: number, over: Partial<PlacementQuote> = {}): PlacementQuote => ({
  id, placement_id: 'p1', line_id: 'L', round_id: 'R', dispatch_id: dispatchId, insurer_name: 'X', premium_text: null, premium_amount: amount,
  currency: 'SGD', limit_text: null, limit_amount: null, excess_text: null, validity_text: null, valid_until: null, key_terms: [], exclusions: [],
  subjectivities: [], summary: null, evidence: {}, source_message_id: null, thread_id: null, status: 'received', needs_review: false,
  extracted_by: 'agent', created_at: T, ...over,
})
const tier = (id: string, label: string, status: PlacementTier['status'], over: Partial<PlacementTier> = {}): PlacementTier => ({
  id, placement_id: 'p1', line_id: 'L', label, spec: {}, target_premium: null, status, source: 'client', source_message_id: null,
  created_by: null, asked_at: status === 'asked' ? '2026-10-28T01:00:00Z' : null, sort: 0, created_at: T, ...over,
})
const bundle = (b: Partial<PlacementBundle>): PlacementBundle => ({ placements: [placement], lines: [line()], rounds: [round], dispatches: [], quotes: [], tiers: [], log: [], ...b })
const pos = (b: Partial<PlacementBundle>) => derivePositions(bundle(b), NOW)[0]

describe('gridOptions', () => {
  it('is the line as asked, labelled by its limit, when there are no tiers', () => {
    expect(gridOptions(pos({ dispatches: [dispatch('d1', 'MSIG')] })).map(o => o.label)).toEqual(['500k'])
  })
  it('falls back to "As asked" with no limit', () => {
    expect(gridOptions(pos({ lines: [line({ spec: {} })], rounds: [{ ...round, spec: {} }] })).map(o => o.label)).toEqual(['As asked'])
  })
  it('drops the base column when tiers exist and nobody priced the base', () => {
    const p = pos({ dispatches: [dispatch('d1', 'MSIG')], tiers: [tier('t1', '500k', 'asked'), tier('t2', '1M', 'asked', { sort: 1 })] })
    expect(gridOptions(p).map(o => o.label)).toEqual(['500k', '1M'])
  })
  it('keeps the base column once someone priced it, and leaves dropped tiers out', () => {
    const p = pos({
      dispatches: [dispatch('d1', 'MSIG')], quotes: [quote('q1', 'd1', 800)],
      tiers: [tier('t1', '1M', 'asked'), tier('t2', '2M', 'dropped', { sort: 1 })],
    })
    expect(gridOptions(p).map(o => o.key)).toEqual(['base', 't1'])
  })
})

describe('lineGrid cells', () => {
  it('puts each tier price under its own column and says what the rest are waiting on', () => {
    const p = pos({
      dispatches: [dispatch('d1', 'MSIG'), dispatch('d2', 'Allianz', { status: 'declined' })],
      quotes: [quote('q1', 'd1', 800), quote('q2', 'd1', 1020, { tier_id: 't1' })],
      tiers: [tier('t1', '1M', 'asked'), tier('t2', '2M', 'proposed', { sort: 1 })],
    })
    const g = lineGrid(p, NOW)
    expect(g.options.map(o => o.label)).toEqual(['500k', '1M', '2M'])
    const msig = g.insurers.find(i => i.insurer === 'MSIG')!
    expect(msig.cells.map(c => c.state)).toEqual(['quoted', 'quoted', 'not_asked'])
    expect(msig.cells[1].quote?.premium_amount).toBe(1020)
    expect(g.insurers.find(i => i.insurer === 'Allianz')!.cells.map(c => c.state)).toEqual(['declined', 'declined', 'declined'])
  })
  it('shows a chase as due and a draft as not yet sent', () => {
    const p = pos({ dispatches: [dispatch('d1', 'Etiqa', { next_chase_at: '2026-10-27T00:00:00Z' }), dispatch('d2', 'HL', { status: 'drafted', sent_at: null })] })
    const g = lineGrid(p, NOW)
    expect(g.insurers.map(i => i.cells[0].state)).toEqual(['chase', 'drafted'])
  })
  it('leaves blank, not "asked", an option another insurer offered unprompted', () => {
    const p = pos({
      dispatches: [dispatch('d1', 'MSIG'), dispatch('d2', 'Allianz')],
      quotes: [quote('q1', 'd1', 800), quote('q2', 'd2', 900), quote('q3', 'd2', 1100, { tier_id: 't9' })],
      tiers: [tier('t9', '1.5M', 'offered', { source: 'insurer' })],
    })
    const g = lineGrid(p, NOW)
    expect(g.insurers.find(i => i.insurer === 'MSIG')!.cells[1].state).toBe('none')
    expect(g.insurers.find(i => i.insurer === 'Allianz')!.cells[1].state).toBe('quoted')
  })
  it('marks an expired price as expired', () => {
    const p = pos({ dispatches: [dispatch('d1', 'MSIG', { status: 'quoted' })], quotes: [quote('q1', 'd1', 800, { valid_until: '2026-10-01' })] })
    expect(cellState(p.dispatches[0], gridOptions(p)[0], p.dispatches[0].quote, NOW)).toBe('expired')
  })
  it('adds rate-table insurers with a price on the base column only', () => {
    const p = pos({ quotes: [quote('e1', null as unknown as string, 700, { dispatch_id: null, insurer_name: 'AIA', source: 'rate_table', plan_label: 'Plan A' })], tiers: [tier('t1', '1M', 'asked')] })
    const g = lineGrid(p, NOW)
    expect(g.insurers).toHaveLength(1)
    expect(g.insurers[0]).toMatchObject({ insurer: 'AIA', product: 'Plan A', dispatch: null })
    expect(g.insurers[0].cells.map(c => c.state)).toEqual(['quoted', 'none'])
  })
  it('names the insurer product on the request', () => {
    const p = pos({ dispatches: [dispatch('d1', 'MSIG', { insurer_product_name: 'GHS Prime' })] })
    expect(lineGrid(p, NOW).insurers[0].product).toBe('GHS Prime')
  })
})

describe('lowestByOption', () => {
  it('marks the lowest price per option once two insurers have priced it', () => {
    const p = pos({
      dispatches: [dispatch('d1', 'MSIG'), dispatch('d2', 'Allianz')],
      quotes: [quote('q1', 'd1', 800), quote('q2', 'd2', 845), quote('q3', 'd1', 1020, { tier_id: 't1' })],
      tiers: [tier('t1', '1M', 'asked')],
    })
    const low = lowestByOption(lineGrid(p, NOW))
    expect(low.get('base')).toBe('q1')
    expect(low.has('t1')).toBe(false)
  })
})

describe('lineStage and the register', () => {
  const stage = (b: Partial<PlacementBundle>, p: Pick<Placement, 'status'> = placement) => lineStage(pos(b), p)
  it('reads the stage a broker acts on', () => {
    expect(stage({})).toEqual({ stage: 'not_asked', waitingOn: 'broker' })
    expect(stage({ dispatches: [dispatch('d1', 'MSIG', { status: 'drafted', sent_at: null })] }).stage).toBe('drafted')
    expect(stage({ dispatches: [dispatch('d1', 'MSIG')] })).toEqual({ stage: 'waiting', waitingOn: 'insurer' })
    expect(stage({ dispatches: [dispatch('d1', 'MSIG', { next_chase_at: '2026-10-27T00:00:00Z' })] }).stage).toBe('chase')
    expect(stage({ dispatches: [dispatch('d1', 'MSIG', { status: 'quoted' }), dispatch('d2', 'HL')], quotes: [quote('q1', 'd1', 1)] })).toEqual({ stage: 'quoting', waitingOn: 'insurer' })
    expect(stage({ dispatches: [dispatch('d1', 'MSIG', { status: 'quoted' })], quotes: [quote('q1', 'd1', 1)] }).stage).toBe('all_in')
    expect(stage({ dispatches: [dispatch('d1', 'MSIG')] }, { status: 'presented' })).toEqual({ stage: 'shared', waitingOn: 'client' })
    expect(stage({ dispatches: [dispatch('d1', 'MSIG')] }, { status: 'bound' }).stage).toBe('bound')
    expect(stage({ lines: [line({ status: 'done', done_at: T })] }).stage).toBe('done')
  })
  it('builds a register row with options, lowest and who sent last', () => {
    const p = pos({
      dispatches: [dispatch('d1', 'MSIG', { status: 'quoted', sent_at: '2026-10-27T03:00:00Z', sent_by: 'jl@trade-risksol.com' }), dispatch('d2', 'HL', { sent_at: '2026-10-27T05:00:00Z', sent_by: 'mt@trade-risksol.com' })],
      quotes: [quote('q1', 'd1', 6840)],
      tiers: [tier('t1', '1M', 'asked')],
    })
    const r = registerRow(p, placement, 'Kranji Precision', 'GHS')
    expect(r).toMatchObject({ ref: 'Q-0142', company_name: 'Kranji Precision', options: ['1M'], round: 1, asked: 2, quoted: 1, stage: 'quoting', waiting_on: 'insurer', last_by: 'mt@trade-risksol.com' })
    // One price is not a lowest: the register follows the grid's two-price rule.
    expect(r.lowest).toBeNull()
    const two = registerRow(pos({
      dispatches: [dispatch('d1', 'MSIG', { status: 'quoted' }), dispatch('d2', 'HL', { status: 'quoted' })],
      quotes: [quote('q1', 'd1', 6840), quote('q2', 'd2', 7120)],
    }), placement, 'Kranji Precision', 'GHS')
    expect(two.lowest?.premium_amount).toBe(6840)
  })
  it('reads a declined line as lost', () => {
    expect(stage({ lines: [line({ status: 'declined' })] }).stage).toBe('lost')
  })
  it('counts open lines by who they wait on', () => {
    const base = registerRow(pos({}), placement, 'A', 'GHS')
    const c = registerCounts([base, { ...base, waiting_on: 'insurer' }, { ...base, waiting_on: 'client' }, { ...base, stage: 'done', waiting_on: null }])
    expect(c).toEqual({ open: 3, broker: 1, insurer: 1, client: 1 })
  })
})
