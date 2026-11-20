/** The Employment Benefits review of 20 Nov 2026: reopen state, workbook freshness. */
import { describe, expect, it } from 'vitest'
import { readEdit, readSnapshot } from '@/lib/gb/eb-proposal'
import { isStale } from '@/lib/gb/workbook'

describe('readEdit', () => {
  it('keeps the census, the categories, the design and last year bounded', () => {
    const e = readEdit({
      members: [{ name: 'A', category: 'Staff', relationship: 'self', dob: '1990-01-02', plans: { GHS: '2' } }, { junk: true }],
      included: ['Staff', 'Managers', 'X', 'Y', 'Z'],
      designs: { Staff: { hs: 3, mm: 99, gp: 1 } },
      current: 'QBE (Steadfast MCare+)',
      lastYear: { insurer: 'QBE', total: 1234, documents: [{ file: 'schedule.pdf', kind: 'schedule' }] },
    })
    expect(e?.members).toHaveLength(1)
    expect(e?.members[0].plans).toEqual({ GHS: '2' })
    expect(e?.included).toHaveLength(4)
    expect(e?.designs.Staff).toEqual({ hs: 3, gp: 1 })
    expect(e?.lastYear?.total).toBe(1234)
  })
  it('is null without a census', () => {
    expect(readEdit({ members: [] })).toBeNull()
    expect(readEdit(null)).toBeNull()
  })
  it('travels with the snapshot', () => {
    const s = readSnapshot({ company: 'Example', effectiveDate: '2027-01-01', products: ['RCC Enhanced III'], categories: [{ name: 'Staff' }], members: [],
      edit: { members: [{ name: 'A', relationship: 'self', age: 30 }], included: ['Staff'], designs: {}, current: '' } })
    expect(s?.edit?.members[0].age).toBe(30)
  })
})

describe('isStale', () => {
  const file = { name: 'TRS EB Calculator.xlsx', driveFileId: 'x', modifiedAt: '2026-11-10T00:00:00Z', readAt: '2026-11-11T00:00:00Z' }
  it('is stale when Drive changed the file after the saved copy', () => {
    expect(isStale(file, '2026-11-19T00:00:00Z')).toBe(true)
    expect(isStale(file, '2026-11-10T00:00:00Z')).toBe(false)
    expect(isStale(file, null)).toBe(false)
  })
  it('falls back to the import time when the Drive time was not kept', () => {
    expect(isStale({ ...file, modifiedAt: null }, '2026-11-10T12:00:00Z')).toBe(false)
    expect(isStale({ ...file, modifiedAt: null }, '2026-11-12T00:00:00Z')).toBe(true)
  })
})

describe('insurerOf', () => {
  it('names one of the five, or Unknown with the name read', async () => {
    const { insurerOf } = await import('@/lib/gb/eb-quote')
    expect(insurerOf('QBE Insurance (Singapore) Pte Ltd')).toBe('QBE (Steadfast MCare+)')
    expect(insurerOf('Raffles Health Insurance')).toBe('Raffles Health (RCC Enhanced III)')
    expect(insurerOf('AIA Singapore')).toBe('AIA (Flexi Vital Care Plus)')
    expect(insurerOf('Great Eastern Life')).toBe('Unknown: Great Eastern Life')
    expect(insurerOf('')).toBe('')
  })
})
