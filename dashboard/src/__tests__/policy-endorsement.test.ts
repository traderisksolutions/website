import { describe, it, expect } from 'vitest'
import { basePolicyNumber, hasEndorsementSuffix, looksLikeEndorsement, findMasterPolicy, withoutEndorsementDuplicates } from '@/lib/policies/endorsement'

// Real shapes from the live policies table (29 Sep 2026): the endorsement carries the master's
// number plus a suffix, or a different number with endorsement wording, and the same term.
const hfw = { id: 'a', policy_number: '2026-A5768313-HFW', class_of_insurance: 'FOREIGN WORKER MEDICAL', description: 'Foreign Workers Medical', start_date: '2026-02-20', end_date: '2027-02-19' }
const hfwE = { id: 'b', policy_number: '2026-A5768313-HFW-E001', class_of_insurance: 'FOREIGN WORKER MEDICAL', description: '$60,000 SA with Co-payment for Liu Jian', start_date: '2026-02-20', end_date: '2027-02-19' }
const eb = { id: 'c', policy_number: 'N0018530', class_of_insurance: 'Employee Benefits Plan endorsement for 1 staff', description: 'Endorsement for adding 1 staff', start_date: '2025-09-01', end_date: '2026-08-31' }
const ebMaster = { id: 'd', policy_number: 'N0018400', class_of_insurance: 'Employee Benefits Plan', description: 'Group Hospital & Surgical', start_date: '2025-09-01', end_date: '2026-08-31' }
const cafe = { id: 'e', policy_number: 'SI25Q04155/QAF/R00/E01', class_of_insurance: 'CafeCare - Food Stall', description: 'Endorsement SI25Q04155/QAF/R00/E01', start_date: '2025-09-18', end_date: '2026-09-17' }

describe('basePolicyNumber', () => {
  it('strips insurer endorsement suffixes and member tags', () => {
    expect(basePolicyNumber('2026-A5768313-HFW-E001')).toBe('2026-A5768313-HFW')
    expect(basePolicyNumber('SI25Q04155/QAF/R00/E01')).toBe('SI25Q04155/QAF/R00')
    expect(basePolicyNumber('N0018676-T00004, N0018676-T00005')).toBe('N0018676')
    expect(basePolicyNumber('N0018530')).toBe('N0018530')
  })
  it('never empties a number', () => { expect(basePolicyNumber('E01')).toBe('E01') })
  it('flags a suffix', () => { expect(hasEndorsementSuffix('X-E1')).toBe(true); expect(hasEndorsementSuffix('X')).toBe(false) })
})

describe('looksLikeEndorsement', () => {
  it('reads the suffix or the wording', () => {
    expect(looksLikeEndorsement(hfwE)).toBe(true)
    expect(looksLikeEndorsement(eb)).toBe(true)
    expect(looksLikeEndorsement(cafe)).toBe(true)
    expect(looksLikeEndorsement(hfw)).toBe(false)
    expect(looksLikeEndorsement(ebMaster)).toBe(false)
  })
})

describe('findMasterPolicy', () => {
  it('matches the base number first', () => { expect(findMasterPolicy(hfwE, [hfw, ebMaster, hfwE])?.id).toBe('a') })
  it('falls back to the one master with the same term end and class', () => { expect(findMasterPolicy(eb, [hfw, ebMaster, eb])?.id).toBe('d') })
  it('refuses to guess between two candidates', () => {
    const other = { ...ebMaster, id: 'f', policy_number: 'N0018401' }
    expect(findMasterPolicy(eb, [ebMaster, other, eb])).toBeNull()
  })
  it('returns null when the endorsement is the only policy', () => { expect(findMasterPolicy(cafe, [cafe])).toBeNull() })
})

describe('withoutEndorsementDuplicates', () => {
  it('counts each cover once for renewals', () => {
    const kept = withoutEndorsementDuplicates([hfw, hfwE, eb, ebMaster, cafe])
    expect(kept.map(p => p.id).sort()).toEqual(['a', 'd', 'e'])
  })
})
