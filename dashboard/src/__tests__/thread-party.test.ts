import { describe, expect, it } from 'vitest'
import { isParty, kindOfParty, partyOfKind } from '@/lib/crm/thread-party'

describe('thread party', () => {
  it('maps a label to the company kind and back', () => {
    expect(kindOfParty('referral')).toBe('partner')
    expect(kindOfParty('insurer')).toBe('insurer')
    expect(partyOfKind('partner')).toBe('referral')
    expect(partyOfKind('client')).toBe('client')
  })
  it('reads a kind outside the three as unlabelled', () => {
    expect(partyOfKind('tpa')).toBeNull()
    expect(partyOfKind(null)).toBeNull()
  })
  it('accepts only the three labels', () => {
    expect(isParty('referral')).toBe(true)
    expect(isParty('partner')).toBe(false)
  })
})
