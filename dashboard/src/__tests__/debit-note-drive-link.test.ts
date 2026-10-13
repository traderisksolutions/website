import { describe, it, expect } from 'vitest'
import { folderIdFromUrl, pickDebitNotePdf } from '@/lib/gdrive-write'

describe('debit note PDF in Drive', () => {
  it('reads the folder id from a Drive link', () => {
    expect(folderIdFromUrl('https://drive.google.com/drive/folders/19RIud7EloAVMB50fk0r1RF0gP2lsqstP')).toBe('19RIud7EloAVMB50fk0r1RF0gP2lsqstP')
    expect(folderIdFromUrl('https://drive.google.com/drive/folders/1CH4OWOcysW6IE8f7500h9nsvf9sCXpX5?usp=sharing')).toBe('1CH4OWOcysW6IE8f7500h9nsvf9sCXpX5')
    expect(folderIdFromUrl(null)).toBeNull()
  })
  it('prefers the generated DN.pdf, then a prefixed source file, then the only pdf, else the folder', () => {
    const gen = { id: '1', name: 'DN261007.pdf', mimeType: 'application/pdf' }
    const src = { id: '2', name: 'DN261007 - Tax Invoice.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-07' }
    const other = { id: '3', name: 'DN260409 - CCCC Bayshore.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-08' }
    const xlsx = { id: '4', name: 'statement.xlsx', mimeType: 'application/vnd.ms-excel' }
    expect(pickDebitNotePdf([other, src, gen], 'DN261007')?.id).toBe('1')
    expect(pickDebitNotePdf([other, src], 'DN261007')?.id).toBe('2')
    expect(pickDebitNotePdf([other, xlsx], 'DN261007')?.id).toBe('3')
    expect(pickDebitNotePdf([other, src, xlsx], 'DN250509')).toBeNull()
    expect(pickDebitNotePdf([{ id: '5', name: 'dn 261007.PDF' }], 'DN261007')?.id).toBe('5')
  })
})
