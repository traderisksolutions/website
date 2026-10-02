import { describe, it, expect } from 'vitest'
import { matchSources, toRecorded, type TableSources } from '@/lib/gb/sources'
import { kindOf, type SourceFile } from '@/lib/gb/drive'

const file = (o: Partial<SourceFile>): SourceFile => ({
  driveFileId: 'f1', insurer: 'QBE Steadfast MCare+', planYear: '2026', filename: 'Steadfast Calculator v20052026.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'calculator',
  bytes: 1, md5: 'aaa', modifiedAt: null, webViewLink: null, ...o,
})

describe('matchSources', () => {
  const qbe = file({})
  const table: TableSources = { rateTableId: 't-qbe', insurerName: 'QBE', sources: [toRecorded(qbe, '2026-10-02')] }

  it('marks the exact file a table was read from as in use', () => {
    const [r] = matchSources([qbe], [table])
    expect(r.status).toBe('in_use')
    expect(r.rateTables).toEqual([{ id: 't-qbe', insurerName: 'QBE' }])
  })

  it('marks a file whose content changed since it was read', () => {
    const [r] = matchSources([file({ md5: 'bbb' })], [table])
    expect(r.status).toBe('changed')
    expect(r.recordedMd5).toBe('aaa')
  })

  it('recognises a replacement uploaded as a new file under the same name', () => {
    const [r] = matchSources([file({ driveFileId: 'f2', md5: 'ccc' })], [table])
    expect(r.status).toBe('changed')
  })

  it('marks a new plan year as not read, even with the same file name', () => {
    const [r] = matchSources([file({ driveFileId: 'f3', planYear: '2027', md5: 'ddd' })], [table])
    expect(r.status).toBe('not_read')
  })

  it('marks a new insurer as not read', () => {
    const [r] = matchSources([file({ driveFileId: 'f4', insurer: 'Singlife MyBenefits Plus', filename: 'x.xlsx' })], [table])
    expect(r.status).toBe('not_read')
  })
})

describe('kindOf', () => {
  it('tells calculators, brochures and TRS workbooks apart', () => {
    expect(kindOf('Steadfast Calculator.xlsx', '', 'QBE')).toBe('calculator')
    expect(kindOf('Brochure.pdf', 'application/pdf', 'QBE')).toBe('brochure')
    expect(kindOf('TRS EB Calculator V1.2.xlsx', '', '_TRS workbooks')).toBe('workbook')
    expect(kindOf('notes.docx', '', 'QBE')).toBe('other')
  })
})

import { verificationOf } from '@/lib/gb/verification'
describe('verificationOf', () => {
  it('reads the recorded level', () => {
    expect(verificationOf({ verification: { status: 'calculator' } }).status).toBe('calculator')
    expect(verificationOf({ verification: { status: 'brochure', basis: 'x' } })).toEqual({ status: 'brochure', basis: 'x' })
  })
  it('treats a table with no record as unverified, never as checked', () => {
    expect(verificationOf(null).status).toBe('unverified')
    expect(verificationOf({}).status).toBe('unverified')
    expect(verificationOf({ verification: { status: 'verified-ish' } }).status).toBe('unverified')
  })
})
