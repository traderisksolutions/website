import { describe, it, expect } from 'vitest'
import { cleanSubject, threadTitle } from '@/lib/crm/subject'

describe('cleanSubject', () => {
  it('collapses reply chains', () => {
    expect(cleanSubject('Re: Re: Re: Re: Re: Re: Re : Talent Trader Group Pte Ltd')).toBe('Talent Trader Group Pte Ltd')
    expect(cleanSubject('RE: FW: Fwd: Quotation')).toBe('Quotation')
  })
  it('drops the firm tag and external markers', () => {
    expect(cleanSubject('Re: (TRS) IHP - Beijing Gas Singapore | SP Claim')).toBe('IHP - Beijing Gas Singapore | SP Claim')
    expect(cleanSubject('RE: [EXTERNAL]Re: [EXTERNAL]Re: Renewal terms')).toBe('Renewal terms')
  })
  it('keeps a plain subject and handles blanks', () => {
    expect(cleanSubject('Director and Officers Liability Insurance')).toBe('Director and Officers Liability Insurance')
    expect(cleanSubject('')).toBe('(no subject)')
    expect(cleanSubject(null)).toBe('(no subject)')
  })
  it('prefers the stored display title', () => {
    expect(threadTitle({ subject: 'Re: Re: x', display_subject: 'Beijing Gas SP claim' })).toBe('Beijing Gas SP claim')
    expect(threadTitle({ subject: 'Re: Re: x', display_subject: '  ' })).toBe('x')
  })
})
