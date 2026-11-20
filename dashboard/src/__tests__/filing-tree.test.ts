import { describe, expect, it } from 'vitest'
import { filingPath, folderForType, folderSafe, insurerFolder, pathLabel, planYearOf, yearFolderName, FILING_FOLDERS } from '@/lib/filing/tree'
import { DOC_TYPES } from '@/lib/documents/taxonomy'

describe('filing tree', () => {
  it('plan year is the start year and the next, with an en dash', () => {
    expect(planYearOf('2027-02-14')).toBe('2027–28')
    expect(planYearOf('2099-12-31')).toBe('2099–00')
    expect(planYearOf(null)).toBeNull()
    expect(planYearOf('14/02/2027')).toBeNull()
  })

  it('every document type has a folder in the fixed list', () => {
    for (const t of DOC_TYPES) expect(FILING_FOLDERS).toContain(folderForType(t.slug))
    expect(folderForType('member_list')).toBe('Census')
    expect(folderForType('renewal_notice')).toBe('Policy')
    expect(folderForType('insurer_debit_note')).toBe('Billing')
    expect(folderForType('quotation')).toBe('Quotes')
    expect(folderForType('claim')).toBe('Claims')
    expect(folderForType('nonsense')).toBe('Other')
  })

  it('a policy files under group, line, plan year · insurer, folder', () => {
    const p = { is_eb: true, insurer: 'QBE', start_date: '2027-02-14' }
    expect(filingPath({ group: 'Brightwell Group', policy: p, docType: 'renewal_notice' }))
      .toEqual(['Brightwell Group', 'Employment Benefits', '2027–28 · QBE', 'Policy'])
    expect(pathLabel(filingPath({ group: 'Brightwell Group', policy: p, docType: 'member_list' })))
      .toBe('Brightwell Group / Employment Benefits / 2027–28 · QBE / Census /')
  })

  it('a confirmed line wins over the class of insurance; slashes never make folders', () => {
    const p = { line_code: 'property', class_of_insurance: 'Public Liability', insurer: 'MSIG / Tokio', start_date: '2026-07-01' }
    expect(filingPath({ group: 'Harbour / Foods', policy: p, docType: 'policy_schedule' }))
      .toEqual(['Harbour, Foods', 'Property, Fire, IAR', '2026–27 · MSIG', 'Policy'])
  })

  it('the line comes from the class of insurance when none is confirmed', () => {
    expect(filingPath({ group: 'G', policy: { class_of_insurance: "Work Injury Compensation", insurer: 'Income', start_date: '2026-01-01' }, docType: 'claim' })[1]).toBe('WICA')
  })

  it('no policy: To sort, and a letter of appointment goes to Letters', () => {
    expect(filingPath({ group: 'G', policy: null, docType: 'quotation' })).toEqual(['G', 'To sort'])
    expect(filingPath({ group: 'G', policy: null, docType: 'broker_appointment' })).toEqual(['G', 'Letters'])
  })

  it('year folder without a date or insurer', () => {
    expect(yearFolderName(null, 'QBE')).toBe('QBE')
    expect(yearFolderName('2026–27', null)).toBe('2026–27')
    expect(yearFolderName(null, null)).toBe('No plan year')
    expect(folderSafe('  A:B*  ')).toBe('A B')
  })
  it('one folder per insurer however the policy spells it', () => {
    for (const n of ['QBE Insurance (Singapore) Pte Ltd', 'QBE Insurance', 'Qbe Insurance']) expect(insurerFolder(n)).toBe('QBE')
    expect(insurerFolder('Great Eastern General Insurance (Malaysia) Berhad')).toBe('Great Eastern Malaysia')
    expect(insurerFolder('Great Eastern General Insurance')).toBe('Great Eastern')
    expect(insurerFolder('Liberty Specialty Markets Singapore Pte Limited')).toBe('Liberty')
    expect(insurerFolder('FIRST CAPITAL INSURANCE LIMITED')).toBe('First Capital Insurance')
    expect(insurerFolder('Berkshire Hathaway Specialty Insurance Company')).toBe('Berkshire Hathaway Specialty Insurance')
    expect(insurerFolder(null)).toBe('')
  })
})
