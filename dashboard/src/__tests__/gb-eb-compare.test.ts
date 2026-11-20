/**
 * Compare on /eb: a column per product, per insurer schedule and per copy; a change of plan
 * reprices the cover and the total; a copy shows its difference from the original; the snapshot
 * carries copies and schedules into the proposal; the Excel rows.
 */
import { describe, it, expect } from 'vitest'
import { choosePlan, columnLabels, compareModel, compareSheet, tierPicks, type EbColumn } from '@/lib/gb/eb-compare'
import { readColumns, readSnapshot, snapshotFromCompare } from '@/lib/gb/eb-proposal'
import { currentFromLastYear, type CoverKey, type Priced, type PricedCover } from '@/lib/gb/eb-quote'
import type { InsurerSchedule } from '@/lib/gb/insurer-schedule'
import type { Member } from '@/lib/gb-quote'

const none: PricedCover = { options: [], pick: '', locked: false, same: { plan: '', reason: 'none' }, lower: { plan: '', reason: 'none' } }
const cover = (opts: [string, number | null][], same: string, lower: string, reason: PricedCover['same']['reason'] = 'same'): PricedCover =>
  ({ options: opts.map(([plan, premium]) => ({ plan, words: plan, premium })), pick: same, locked: false, same: { plan: same, reason }, lower: { plan: lower, reason: lower === same ? 'same' : 'lower' } })
const covers = (hs: PricedCover, gp: PricedCover = none): Record<CoverKey, PricedCover> => ({ hs, mm: none, gp, sp: none, gd: none, pa: none })
const priced: Priced = {
  products: ['Income FlexCare', 'AIA Flexi Vital Care Plus'], notes: [], rules: [],
  workbook: { name: 'wb', driveFileId: null, modifiedAt: null, readAt: '2026-11-20' },
  categories: [
    { name: 'Directors', employees: 2, lives: 3, today: { words: {} as Record<CoverKey, string>, premium: {} as Record<CoverKey, null>, product: null },
      products: { 'Income FlexCare': covers(cover([['Plan 2', 900], ['Plan 4', 600]], 'Plan 2', 'Plan 4'), cover([['Plan 1', 200], ['Plan 2', 150]], 'Plan 2', 'Plan 2')), 'AIA Flexi Vital Care Plus': covers(cover([['Plan 4', 1000]], 'Plan 4', 'Plan 4', 'no same plan')) } },
    { name: 'Staff', employees: 3, lives: 3, today: { words: {} as Record<CoverKey, string>, premium: {} as Record<CoverKey, null>, product: null },
      products: { 'Income FlexCare': covers(cover([['Plan 2', 800], ['Plan 4', 500]], 'Plan 4', 'Plan 4'), cover([['Plan 1', 250], ['Plan 2', 180]], 'Plan 2', 'Plan 2')), 'AIA Flexi Vital Care Plus': covers(cover([['Plan 4', null]], 'Plan 4', 'Plan 4')) } },
  ],
}
const brochure = (product: string, tier: 'same' | 'lower' = 'same'): EbColumn => ({ id: product, kind: 'brochure', product, copyOf: null, picks: tierPicks(priced, product, tier) })
const schedule: InsurerSchedule = { file: 'qbe.xlsx', insurer: 'Steadfast MCare+', readBy: 'code', notes: [], total: null, figures: [
  { cover: 'hs', category: 'Directors', premium: 700, source: 'qbe.xlsx · Quote!C3', status: 'read' },
  { cover: 'hs', category: 'Staff', premium: 650, source: 'qbe.xlsx · Quote!C4', status: 'check' },
  { cover: 'gp', category: null, premium: 300, source: 'qbe.xlsx · Quote!D5', status: 'read' },
] }
const members: Member[] = [
  { name: 'D1', category: 'Directors', relationship: 'self', age: 50 }, { name: 'D2', category: 'Directors', relationship: 'self', age: 52 }, { name: 'D3', category: 'Directors', relationship: 'spouse', age: 49 },
  { name: 'S1', category: 'Staff', relationship: 'self', age: 30 }, { name: 'S2', category: 'Staff', relationship: 'self', age: 31 }, { name: 'S3', category: 'Staff', relationship: 'self', age: 32 },
]

describe('compare model', () => {
  const cols = [brochure('Income FlexCare'), brochure('AIA Flexi Vital Care Plus'), { id: 's1', kind: 'schedule', schedule } as EbColumn]
  const m = compareModel(priced, cols, currentFromLastYear(null), 'same')
  it('a cover premium is the sum over categories of the plans chosen; the total sums the covers', () => {
    expect(m.rows.find(r => r.key === 'hs')!.cells[0].premium).toBe(1400)
    expect(m.columns[0].total).toBe(1730)
    expect(m.columns[0].perEmployee).toBe(346)
    expect(m.columns.map(c => c.source)).toEqual(['Brochure', 'Brochure', 'Insurer schedule'])
  })
  it('the insurer schedule column sums its figures per cover and keeps the weakest status', () => {
    const hs = m.rows.find(r => r.key === 'hs')!.cells[2]
    expect(hs).toMatchObject({ kind: 'schedule', premium: 1350, status: 'check' })
    expect(m.columns[2].total).toBe(1650)
  })
  it('Current is blank when nothing was read (call note 23)', () => {
    expect(m.current.total).toBeNull()
    expect(m.rows.every(r => r.current == null)).toBe(true)
  })
  it('a census category with no same plan, or a plan with no rate, flags the cell', () => {
    const aia = m.rows.find(r => r.key === 'hs')!.cells[1]
    expect(aia.kind === 'plans' && aia.flag).toBe(true)
    expect(m.columns[1].flags).toBe(1)
    expect(m.columns[0].flags).toBe(0)
  })
  it('the match reason per category: same, then changed when the broker picks another plan', () => {
    const changed = choosePlan(priced, cols[0] as Extract<EbColumn, { kind: 'brochure' }>, 'Directors', 'hs', 'Plan 4')
    const m2 = compareModel(priced, [changed, cols[1], cols[2]], currentFromLastYear(null), 'same')
    const cell = m2.rows.find(r => r.key === 'hs')!.cells[0]
    expect(cell.kind === 'plans' && cell.perCategory.map(x => x.reason)).toEqual(['changed', 'same'])
    expect(cell.premium).toBe(1100)
    expect(m2.columns[0].total).toBe(1430)
  })
  it('Lower tier sets every pick one plan lower where one exists', () => {
    const lower = compareModel(priced, [brochure('Income FlexCare', 'lower')], currentFromLastYear(null), 'lower')
    const cell = lower.rows.find(r => r.key === 'hs')!.cells[0]
    expect(cell.kind === 'plans' && cell.perCategory.map(x => [x.plan, x.reason])).toEqual([['Plan 4', 'lower'], ['Plan 4', 'same']])
  })
})

describe('copies', () => {
  const orig = brochure('Income FlexCare')
  const copy: EbColumn = { id: 'c1', kind: 'copy', product: 'Income FlexCare', copyOf: orig.id, picks: JSON.parse(JSON.stringify((orig as Extract<EbColumn, { kind: 'brochure' }>).picks)) }
  it('a copy is labelled and starts equal to its original', () => {
    expect(columnLabels([orig, copy, { ...copy, id: 'c2' }])).toEqual(['Income FlexCare', 'Income FlexCare · copy', 'Income FlexCare · copy 2'])
    expect(compareModel(priced, [orig, copy], currentFromLastYear(null), 'same').columns[1].vsOriginal).toBe(0)
  })
  it('a change in the copy alone shows its difference against the original', () => {
    const changed = choosePlan(priced, copy as Extract<EbColumn, { kind: 'copy' }>, 'Directors', 'hs', 'Plan 4')
    const m = compareModel(priced, [orig, changed], currentFromLastYear(null), 'same')
    expect(m.columns[0].total).toBe(1730)
    expect(m.columns[1].vsOriginal).toBe(-300)
  })
})

describe('the proposal carries the chosen columns', () => {
  const orig = brochure('Income FlexCare')
  const copy: EbColumn = choosePlan(priced, { id: 'c1', kind: 'copy', product: 'Income FlexCare', copyOf: orig.id, picks: (orig as Extract<EbColumn, { kind: 'brochure' }>).picks }, 'Staff', 'hs', 'Plan 2')
  const cols = [orig, copy, { id: 's1', kind: 'schedule', schedule } as EbColumn]
  const m = compareModel(priced, cols, currentFromLastYear(null), 'same')
  const snap = snapshotFromCompare({ model: m, cols, include: ['Income FlexCare · copy', 'Steadfast MCare+ (insurer schedule)'], company: 'Zzq Co', effectiveDate: '2027-01-01', basis: 'renewal', members, workbook: 'wb', edit: { members, included: ['Directors', 'Staff'], designs: {}, current: '', lastYear: null, mode: 'insurer', tier: 'same', columns: cols } })
  it('labels, the product behind a copy, and the schedule figure under its category', () => {
    expect(snap.products).toEqual(['Income FlexCare · copy', 'Steadfast MCare+ (insurer schedule)'])
    expect(snap.columnProducts).toEqual({ 'Income FlexCare · copy': 'Income FlexCare' })
    expect(snap.categories[1].covers.hs['Income FlexCare · copy']).toMatchObject({ plan: 'Plan 2', premium: 800 })
    expect(snap.categories[0].covers.hs['Steadfast MCare+ (insurer schedule)'].premium).toBe(700)
    expect(snap.categories[0].covers.gp['Steadfast MCare+ (insurer schedule)'].premium).toBe(300)
    expect(snap.categories[1].covers.gp['Steadfast MCare+ (insurer schedule)'].premium).toBeNull()
  })
  it('survives the request bounds, columns and schedules included, for reopening', () => {
    const back = readSnapshot(JSON.parse(JSON.stringify(snap)))!
    expect(back.columnProducts).toEqual(snap.columnProducts)
    expect(back.edit?.mode).toBe('insurer')
    expect(back.edit?.columns?.map(c => c.kind)).toEqual(['brochure', 'copy', 'schedule'])
    const s = back.edit!.columns![2]
    expect(s.kind === 'schedule' && s.schedule.figures[1].status).toBe('check')
    expect(readColumns([{ id: 'x', kind: 'nope' }, { id: '', kind: 'copy', product: 'A' }, { id: 'y', kind: 'schedule', schedule: { figures: [] } }])).toEqual([])
  })
})

describe('Excel rows', () => {
  it('covers down, Current then each column; plans under each cover; totals', () => {
    const m = compareModel(priced, [brochure('Income FlexCare')], currentFromLastYear(null), 'same')
    const rows = compareSheet(m, { company: 'Zzq Co', effectiveDate: '2027-01-01' })
    expect(rows[3]).toEqual(['Cover', 'Current', 'Income FlexCare'])
    expect(rows.find(r => r[0] === 'Hospital & Surgical')).toEqual(['Hospital & Surgical', null, 1400])
    expect(rows.find(r => r[0] === '  Directors · plan')).toEqual(['  Directors · plan', null, 'Plan 2'])
    expect(rows.find(r => r[0] === 'Total a year')).toEqual(['Total a year', null, 1730])
  })
})
