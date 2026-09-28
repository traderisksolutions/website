import { describe, it, expect } from 'vitest'
import { nameFromDomain } from '@/lib/crm/autofile'
import { signatureTail } from '@/lib/crm/signature'
import { domainMatchesName } from '@/lib/crm/resolve'

describe('nameFromDomain', () => {
  it('turns a domain into a readable placeholder name', () => {
    expect(nameFromDomain('axismachines.org')).toBe('Axismachines')
    expect(nameFromDomain('mpinsb.com.my')).toBe('Mpinsb')
    expect(nameFromDomain('cold-chain.com.sg')).toBe('Cold Chain')
  })
})

describe('domain stem finds a company that only has a name', () => {
  // The case that was making twins: a client born from a debit note, then their first email.
  it('@flavia matches "Flavia Holdings Pte Ltd" so no second record is created', () => {
    expect(domainMatchesName('flavia.com', 'Flavia Holdings Pte Ltd')).toBe(true)
  })
  it('@bll.com.sg matches the long-form BLL record', () => {
    // Three letters is below the stem threshold on purpose — too many false hits.
    expect(domainMatchesName('bll.com.sg', "BLL's Transportation and Trading Pte Ltd")).toBe(false)
  })
  it('does not match an unrelated company', () => {
    expect(domainMatchesName('flavia.com', 'Healthway Medical Group Pte Ltd')).toBe(false)
  })
})

describe('signatureTail', () => {
  it('keeps the end of the sender\'s own text and drops the quoted history', () => {
    const body = 'Hi Nathan,\n\nPlease see attached.\n\nRegards,\nJane Tan\nFinance Manager\nFlavia Holdings Pte Ltd\n\nOn Mon, 21 Sep 2026 Nathan wrote:\n> old stuff\n> more old stuff'
    const tail = signatureTail(body)
    expect(tail).toContain('Finance Manager')
    expect(tail).toContain('Flavia Holdings Pte Ltd')
    expect(tail).not.toContain('old stuff')
  })
  it('returns an empty-ish tail for a bare one-liner', () => {
    expect(signatureTail('ok thanks').length).toBeLessThan(20)
  })
})
