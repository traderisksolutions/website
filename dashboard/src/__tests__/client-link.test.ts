import { describe, expect, it } from 'vitest'
import { acronym, clientByName, matchClient, nameWords, type ClientRef } from '@/lib/crm/client-link'

const aas: ClientRef = { id: 'aas', company_name: 'AUTOMOBILE ASSOCIATION OF SINGAPORE', domain: 'aas.com.sg', domains: ['aas.com.sg', 'legacyfa-asia.com'] }
const oue: ClientRef = { id: 'oue', company_name: 'OUE Limited', domain: null, domains: [] }
const oueh: ClientRef = { id: 'oueh', company_name: 'OUE Hospitality Trust', domain: null, domains: [] }
const keller: ClientRef = { id: 'keller', company_name: 'KELLER FOUNDATIONS (S E ASIA) PTE LTD', domain: 'keller.com.sg', domains: ['keller.com.sg'] }
const hmg: ClientRef = { id: 'hmg', company_name: 'HEALTHWAY MEDICAL GROUP PTE LTD', domain: 'healthwaymedical.com', domains: ['healthwaymedical.com'] }
const talent: ClientRef = { id: 'tt', company_name: 'Talent Trader Pte Ltd', domain: 'talenttrader.com.sg', domains: [] }
const clients = [aas, oue, oueh, keller, hmg, talent]

describe('acronym', () => {
  it('initials of the words that identify a name, legal words dropped', () => {
    expect(acronym('AUTOMOBILE ASSOCIATION OF SINGAPORE')).toBe('AAS')
    expect(acronym('HEALTHWAY MEDICAL GROUP PTE LTD')).toBe('HMG')
    expect(acronym('OUE Limited')).toBeNull()
    expect(nameWords('KELLER FOUNDATIONS (S E ASIA) PTE LTD')).toEqual(['keller', 'foundations'])
  })
})

describe('matchClient', () => {
  it('names the client an insurer request subject carries', () => {
    expect(matchClient('(TRS) QBE- OUE Limited', clients)).toMatchObject({ client: oue, how: 'name' })
    expect(matchClient('Re: TRS (IHP) : Talent Trader Pte Ltd (GMB-N0018840-T00001)- Unable to submit dental claim', clients)).toMatchObject({ client: talent, how: 'name' })
  })
  it('reads an acronym the way TRS writes subjects', () => {
    expect(matchClient('(TRS) Chubb- AAS WIC', clients)).toMatchObject({ client: aas, how: 'acronym' })
    expect(matchClient('Re: Manuel claim for H&S - Jasmine Teo l HMG', clients)).toMatchObject({ client: hmg, how: 'acronym' })
    expect(matchClient('Re: Manuel claim - Jasmine Teo l hmg', clients)).toBeNull()
  })
  it('reads a domain label', () => {
    expect(matchClient('Re: Keller - WICA renewal 2027', clients)).toMatchObject({ client: keller, how: 'domain' })
  })
  it('prefers the longer name when the shorter is its prefix, and refuses two unrelated matches', () => {
    expect(matchClient('(TRS) Income - OUE Hospitality Trust renewal', clients)).toMatchObject({ client: oueh })
    expect(matchClient('(TRS) Singlife - OUE Limited', clients)).toMatchObject({ client: oue })
    expect(matchClient('AAS and Keller joint cover', clients)).toBeNull()
  })
  it('finds nothing in a subject that names nobody', () => {
    expect(matchClient('Trade Risk Solutions - Allianz Catch up', clients)).toBeNull()
    expect(matchClient('Bangkok itinerary', clients)).toBeNull()
    expect(matchClient(null, clients)).toBeNull()
  })
})

describe('clientByName', () => {
  it('matches the name a model or a census wrote, normalised', () => {
    expect(clientByName('OUE LIMITED', clients)).toBe(oue)
    expect(clientByName('Talent Traders Group Pte. Ltd', clients)).toBe(talent)
    expect(clientByName('Mednefits', clients)).toBeNull()
  })
})
