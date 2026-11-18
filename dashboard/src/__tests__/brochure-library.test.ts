import { describe, it, expect } from 'vitest'
import type { SourceFile } from '@/lib/gb/drive'
import { folderName, libraryRows, newVersionFrom, nextVersion, parseFolder, uploadedFileFrom, versionPatchFrom, type DbVersion } from '@/lib/brochures/library'

const file = (insurer: string, planYear: string | null, filename: string, id = `${insurer}-${planYear}-${filename}`.replace(/\W/g, '_').padEnd(12, 'x')): SourceFile => ({
  driveFileId: id, insurer, planYear, filename, mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  kind: 'other', bytes: 1, md5: null, modifiedAt: null, webViewLink: `https://drive.invalid/${id}`,
})
const db = (o: Partial<DbVersion>): DbVersion => ({ id: 'd1', line: 'Travel', product: 'P', version: 'v1', in_force_from: null, drive_folder_id: null, drive_url: null, files: [], note: null, status: 'in_force', created_by: 'a@trs.invalid', created_at: '2026-11-19', ...o })

describe('brochure library', () => {
  it('reads folder names both ways', () => {
    expect(parseFolder(folderName('v14', '2026-10-01'))).toEqual({ version: 'v14', in_force_from: '2026-10-01' })
    expect(parseFolder('2026')).toEqual({ version: '2026', in_force_from: null })
  })

  it('dates decide in force, scheduled and superseded; workbooks and loose files are handled', () => {
    const rows = libraryRows([
      file('QBE Steadfast MCare+', 'v14 · in force 2026-10-01', 'brochure.pdf'),
      file('QBE Steadfast MCare+', 'v14 · in force 2026-10-01', 'calculator.xlsx'),
      file('QBE Steadfast MCare+', 'v13 · in force 2026-04-01', 'brochure.pdf'),
      file('QBE Steadfast MCare+', 'v15 · in force 2027-01-01', 'brochure.pdf'),
      file('QBE Steadfast MCare+', null, 'loose.pdf'),
      file('_Comparisons', '2026', 'book.xlsx'),
    ], [], '2026-11-19')
    expect(rows.map(r => [r.version, r.status])).toEqual([['v15', 'scheduled'], ['v14', 'in_force'], ['v13', 'superseded'], ['Not in a version folder', 'to_confirm']])
    expect(rows[1].files.map(f => f.kind)).toEqual(['brochure', 'rates'])
  })

  it('saved rows add line, date and note, and removed rows leave the list', () => {
    const rows = libraryRows([file('Income FlexCare', '2025', 'a.pdf'), file('Income FlexCare', '2026', 'b.pdf')],
      [db({ product: 'Income FlexCare', version: '2025', line: 'Employment Benefits', note: 'old', status: 'removed' }), db({ id: 'd2', product: 'Income FlexCare', version: '2026', line: 'Employment Benefits', in_force_from: '2026-03-01', note: 'n' })], '2026-11-19')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'd2', version: '2026', in_force_from: '2026-03-01', note: 'n', status: 'in_force' })
  })

  it('a bare year counts from 1 January', () => {
    const rows = libraryRows([file('X', '2025', 'a.pdf'), file('X', '2026', 'b.pdf')], [], '2026-11-19')
    expect(rows.map(r => [r.version, r.status])).toEqual([['2026', 'in_force'], ['2025', 'superseded']])
  })

  it('names the next version', () => {
    expect(nextVersion([{ product: 'A', version: 'v12' }, { product: 'a', version: 'v14' }, { product: 'B', version: 'v30' }], 'A')).toBe('v15')
    expect(nextVersion([], 'New')).toBe('v1')
  })

  it('checks Add version and Edit at the boundary', () => {
    expect(newVersionFrom({ product: ' QBE  MCare+ ', line: 'Employment Benefits', version: 'v15', in_force_from: '2027-01-01' })).toEqual({ ok: { product: 'QBE MCare+', line: 'Employment Benefits', version: 'v15', in_force_from: '2027-01-01', note: null } })
    expect(newVersionFrom({ product: 'a/b', line: 'Travel', version: 'v1', in_force_from: '2027-01-01' })).toHaveProperty('error')
    expect(newVersionFrom({ product: '_x', line: 'Travel', version: 'v1', in_force_from: '2027-01-01' })).toHaveProperty('error')
    expect(newVersionFrom({ product: 'A', line: 'Motor', version: 'v1', in_force_from: '2027-01-01' })).toHaveProperty('error')
    expect(newVersionFrom({ product: 'A', line: 'Travel', version: 'v1', in_force_from: '1 Jan' })).toHaveProperty('error')
    expect(versionPatchFrom({ version: 'v2' })).toHaveProperty('error')
    expect(versionPatchFrom({ note: '  ', in_force_from: '2026-01-02' })).toEqual({ ok: { note: null, in_force_from: '2026-01-02' } })
  })

  it('records only Drive file ids', () => {
    expect(uploadedFileFrom({ id: '1AbCdEfGhIjK', name: 'rates.xlsx' })).toMatchObject({ kind: 'rates', url: 'https://drive.google.com/file/d/1AbCdEfGhIjK/view' })
    expect(uploadedFileFrom({ id: '../x', name: 'a' })).toBeNull()
  })
})
