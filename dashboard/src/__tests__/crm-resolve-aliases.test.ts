import { describe, expect, it } from 'vitest'
import { makeCompanyIndex, matchByName, matchByDomain, resolveThread } from '@/lib/crm/resolve'
import type { Company } from '@/lib/crm/types'

// Invented companies; the shapes mirror companies rows after normalizeCompany().
const company = (id: string, name: string, kind: Company['kind'], domains: string[]): Company =>
  ({ id, name, kind, domains, stage: 'client', domain: domains[0] ?? null } as unknown as Company)

const clients = [
  company('c1', 'Example Dental Group Pte Ltd', 'client', ['exampledental.example']),
  company('c2', 'Northgate Logistics Pte Ltd', 'client', ['northgate.example']),
]
const aliases = [{ company_id: 'c1', alias: 'EDG Dental' }, { company_id: 'c2', alias: 'Northgate' }]

describe('company index with aliases', () => {
  it('resolves a subject that uses a confirmed alias', () => {
    const index = makeCompanyIndex(clients, [], aliases)
    expect(matchByName('RE: EDG Dental — GHS renewal', index)?.companyId).toBe('c1')
    expect(matchByName('Northgate: WICA quotation', index)?.companyId).toBe('c2')
  })
  it('ignores an alias whose company is not in the index', () => {
    const index = makeCompanyIndex(clients, [], [{ company_id: 'ghost', alias: 'Ghost Holdings' }])
    expect(matchByName('Ghost Holdings renewal', index)).toBeNull()
  })
  it('an alias shared by two companies identifies nobody', () => {
    const index = makeCompanyIndex(clients, [], [{ company_id: 'c1', alias: 'Shared Name' }, { company_id: 'c2', alias: 'Shared Name' }])
    expect(matchByName('Shared Name — claim', index)).toBeNull()
  })
})

describe('resolver order on a thread', () => {
  it("a client's own domain beats a subject that names another client", () => {
    const index = makeCompanyIndex(clients, [], aliases)
    const hit = resolveThread({ subject: 'Northgate quotation', participantEmails: ['hr@exampledental.example'] }, index)
    expect(hit?.companyId).toBe('c1')
    expect(hit?.via).toBe('domain')
  })
  it('an excluded counterparty domain never resolves as the client', () => {
    const index = makeCompanyIndex(clients, ['insurer.example'], aliases)
    expect(matchByDomain(['claims@insurer.example'], index)).toBeNull()
    const hit = resolveThread({ subject: 'RE: Northgate — claim', participantEmails: ['claims@insurer.example'] }, index)
    expect(hit?.companyId).toBe('c2')
    expect(hit?.via).toBe('name')
  })
})
