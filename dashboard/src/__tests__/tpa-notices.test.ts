import { describe, it, expect } from 'vitest'
import { nextStage, readTpaNotice } from '@/lib/claims/tpa-notices'

const body = (refs: string) => `Dear Member,\n\nYour claim is pending for your action.\n\nClaim Reference No.: ${refs}\n\nYou may submit…`
describe('TPA claim notices', () => {
  it('reads an IHP pending notice with two references, and a settlement notice', () => {
    expect(readTpaNotice('claims@ihp.com.sg', 'Claim Pending Further Action (JGC Asia Pacific Pte Ltd)', body('R00005088494,R00005088501'))).toEqual({ kind: 'pending', refs: ['R00005088494', 'R00005088501'] })
    expect(readTpaNotice('Claims <claims@ihp.com.sg>', 'RE: Claim Settlement Document Ready for Viewing ( EMPYRION DC PTE. LTD. )', body('R00005066042'))).toEqual({ kind: 'settled', refs: ['R00005066042'] })
  })
  it('ignores other senders, other subjects and a notice with no reference', () => {
    expect(readTpaNotice('someone@client.example', 'Claim Pending Further Action', body('R00005088494'))).toBeNull()
    expect(readTpaNotice('claims@ihp.com.sg', 'Your e-statement', body('R00005088494'))).toBeNull()
    expect(readTpaNotice('claims@ihp.com.sg', 'Claim Pending Further Action', 'Dear Member, no reference here')).toBeNull()
  })
  it('only moves a claim forward, and never reopens a closed one', () => {
    expect(nextStage('notified', 'pending')).toBe('documents_pending')
    expect(nextStage('notified', 'settled')).toBe('settled')
    expect(nextStage('with_insurer', 'pending')).toBeNull()
    expect(nextStage('settled', 'pending')).toBeNull()
    expect(nextStage('declined', 'settled')).toBeNull()
  })
})
