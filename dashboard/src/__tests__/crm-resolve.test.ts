import { describe, it, expect } from 'vitest'
import { companyCore, makeCompanyIndex, matchByName, matchByDomain, resolveThread, clientSideDomains, domainMatchesName } from '@/lib/crm/resolve'
import type { Company } from '@/lib/crm/types'

const co = (id: string, name: string, domains: string[] = []): Company => ({
  id, name, kind: 'client', stage: 'client', stage_changed_at: null, owner_email: null, domains,
  domain: domains[0] ?? null, type: null, industry: null, address: null, notes: null, source: null,
  ai_brief: null, ai_brief_at: null, ai_brief_model: null, created_at: '', updated_at: '',
})

// Shaped after the live data, including the two "Fong" companies that must not be confused.
const COMPANIES = [
  co('bg',  'BEIJING GAS SINGAPORE PTE. LTD.', ['bjgas.com']),
  co('jk',  'JK Wildlife Pte Ltd'),
  co('kf',  'Keller Foundations (S E Asia) Pte Ltd'),
  co('fg',  'Fong Group 2023 Pte Ltd'),
  co('fs',  'Fong Seng Fast Food Pte Ltd'),
  co('sb',  'Soilbuild', ['soilbuild.com']),
  co('ar',  'Articares Pte Ltd'),
  co('cw',  'China International Water & Electric Corporation (Singapore) Pte Ltd'),
  co('cj',  'China Jingye Engineering Corporation Limited Singapore Branch'),
]
const index = makeCompanyIndex(COMPANIES, ['libertyinsurance.com.sg', 'qbe.com'])

describe('companyCore', () => {
  it('strips trailing legal noise but keeps words inside the name', () => {
    expect(companyCore('JK Wildlife Pte Ltd')).toBe('jk wildlife')
    expect(companyCore('BEIJING GAS SINGAPORE PTE. LTD.')).toBe('beijing gas')
    expect(companyCore('Fong Group 2023 Pte Ltd')).toBe('fong group 2023')
    expect(companyCore('Articares Pte Ltd')).toBe('articares')
    expect(companyCore('Soilbuild')).toBe('soilbuild')
  })
})

describe('matchByName', () => {
  it('files a thread by the client name in the subject, whoever sent it', () => {
    expect(matchByName('RE: TRS( QBE) : Beijing Gas Singapore Pte Ltd- Policy Renewal', index)?.companyId).toBe('bg')
    expect(matchByName('Re: (TRS) JK Wildlife - FWMI Renewal 2026', index)?.companyId).toBe('jk')
    expect(matchByName('TRS (RHI) : Keller Foundations SE Asia - Quotation', index)?.companyId).toBe('kf')
  })

  it('keeps the two Fong companies apart', () => {
    expect(matchByName('Re: (TRS) Fong Group - Food Stall Insurance', index)?.companyId).toBe('fg')
    expect(matchByName('Renewal for Fong Seng Fast Food', index)?.companyId).toBe('fs')
  })

  it('matches on word boundaries, not inside longer words', () => {
    expect(matchByName('Articaresx Holdings enquiry', index)).toBeNull()
    expect(matchByName('update on soilbuilders', index)).toBeNull()
  })

  it('prefers the longest, most specific match', () => {
    expect(matchByName('2nd Reminder - CAFECARE FOR FONG GROUP 2023 PTE LTD', index)?.evidence).toContain('fong group 2023')
  })

  it('refuses to match on a generic word two companies share', () => {
    // Both China companies would answer to "china"; neither may claim it.
    expect(matchByName('Re: China quarterly review', index)).toBeNull()
    expect(matchByName('Re: renewal for the group', index)).toBeNull()
  })

  it('returns nothing for an empty or unrelated subject', () => {
    expect(matchByName('', index)).toBeNull()
    expect(matchByName(null, index)).toBeNull()
    expect(matchByName('Re: Office Insurance renewal', index)).toBeNull()
  })
})

describe('matchByDomain', () => {
  it('matches a domain a company owns', () => {
    expect(matchByDomain(['eric@bjgas.com'], index)?.companyId).toBe('bg')
    expect(matchByDomain(['Lu <lu.vuijiin@soilbuild.com>'], index)?.companyId).toBe('sb')
  })
  it('never matches a webmail, an insurer or our own domain', () => {
    expect(matchByDomain(['someone@gmail.com'], index)).toBeNull()
    expect(matchByDomain(['ng.belinda@libertyinsurance.com.sg'], index)).toBeNull()
    expect(matchByDomain(['catherine.lim@trade-risksol.com'], index)).toBeNull()
  })
})

describe('resolveThread', () => {
  it('trusts the contact first, then the domain, then the subject', () => {
    expect(resolveThread({ subject: 'JK Wildlife renewal', participantEmails: ['x@bjgas.com'], contactCompanyId: 'ar' }, index))
      .toMatchObject({ companyId: 'ar', via: 'contact' })
    expect(resolveThread({ subject: 'JK Wildlife renewal', participantEmails: ['x@bjgas.com'] }, index))
      .toMatchObject({ companyId: 'bg', via: 'domain' })
    expect(resolveThread({ subject: 'JK Wildlife renewal', participantEmails: ['x@unknown.com'] }, index))
      .toMatchObject({ companyId: 'jk', via: 'name' })
  })

  it('ignores a contact pointing at a company that no longer exists', () => {
    expect(resolveThread({ subject: 'nothing to match', participantEmails: [], contactCompanyId: 'deleted' }, index)).toBeNull()
  })

  it('leaves a thread unresolved rather than guessing', () => {
    expect(resolveThread({ subject: 'Re: Quotation for a new prospect', participantEmails: ['hr@newco.com'] }, index)).toBeNull()
  })
})

describe('clientSideDomains', () => {
  it('keeps only the client side, so an insurer domain is never learned as the client', () => {
    const found = clientSideDomains(
      ['eric@newclient.com.sg', 'catherine.lim@trade-risksol.com', 'ng.belinda@libertyinsurance.com.sg', 'noreply@qbe.com', 'someone@gmail.com'],
      index,
    )
    expect(found).toEqual(['newclient.com.sg'])
  })
})

describe('domainMatchesName — the gate that stops an insurer domain becoming a client domain', () => {
  it('accepts a domain that reads like the company name', () => {
    expect(domainMatchesName('jkwildlife.sg', 'JK Wildlife Pte Ltd')).toBe(true)
    expect(domainMatchesName('soilbuild.com', 'Soilbuild')).toBe(true)
    expect(domainMatchesName('articares.com', 'Articares Pte Ltd')).toBe(true)
    expect(domainMatchesName('empyriondigital.com', 'Empyrion DC Pte Ltd')).toBe(true)
  })

  it('rejects insurers, administrators and brokers', () => {
    // The exact regression: these were about to be learned as client domains.
    expect(domainMatchesName('libertyinsurance.com.sg', 'Fong Group 2023 Pte Ltd')).toBe(false)
    expect(domainMatchesName('qbe.com', 'BEIJING GAS SINGAPORE PTE. LTD.')).toBe(false)
    expect(domainMatchesName('ihp.com.sg', 'BEIJING GAS SINGAPORE PTE. LTD.')).toBe(false)
    expect(domainMatchesName('aia.com.sg', 'Keller Foundations (S E Asia) Pte Ltd')).toBe(false)
    expect(domainMatchesName('mednefits.com', 'JK Wildlife Pte Ltd')).toBe(false)
  })

  it('never trusts a short domain label', () => {
    expect(domainMatchesName('abc.com', 'ABC Holdings Pte Ltd')).toBe(false)
  })
})
