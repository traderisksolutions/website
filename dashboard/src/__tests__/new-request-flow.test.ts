import { describe, it, expect } from 'vitest'
import { LINE_SPECS, missingData, missingAsks, familyOf } from '@/lib/placement/lines'
import { buildDraft } from '@/lib/admin/b/drafts'
import { ROUTE_FALLBACK } from '@/lib/placement/auto'
import { isValidProductLine } from '@/lib/product-lines'

const sub = (line: string, fields: Record<string, string>, extra: Record<string, unknown> = {}) =>
  LINE_SPECS[line].submission!({ clientName: 'Example Pte Ltd', spec: { fields, ...extra }, inceptionDate: '2026-12-01', deadline: '2026-11-10', roundNo: 1, changeSummary: null })

describe('the five busiest lines have a full spec', () => {
  for (const l of ['employee_benefits', 'group_health', 'group_personal_accident', 'construction_car', 'wica', 'foreign_worker_medical', 'professional_indemnity', 'do', 'cyber', 'commercial_vehicle']) {
    it(`${l}: fields, required data, documents and a fixed submission`, () => {
      const s = LINE_SPECS[l]
      expect(s.fields.length).toBeGreaterThan(3)
      expect(s.required?.length).toBeGreaterThan(1)
      expect(s.required!.every(k => s.fields.some(f => f.key === k))).toBe(true)
      expect(s.documentsToAsk.length).toBeGreaterThan(0)
      expect(typeof s.submission).toBe('function')
    })
  }
  it('GPA is a product line and a workforce family', () => {
    expect(isValidProductLine('group_personal_accident')).toBe(true)
    expect(familyOf('group_personal_accident')).toBe('workforce')
    expect(ROUTE_FALLBACK.group_personal_accident).toContain('employee_benefits')
  })
})

describe('the data gate', () => {
  it('holds a WICA request with no wages by category', () => {
    expect(missingData('wica', { fields: { business: 'Logistics' } }, '2026-12-01')).toEqual(['Employees by category'])
    expect(missingData('wica', { fields: { business: 'Logistics', categories: 'Office: 16, S$1.3m' } }, '2026-12-01')).toEqual([])
  })
  it('a census counts only when it is attached', () => {
    expect(missingData('employee_benefits', { fields: { member_count: '22', census: 'to be provided' } }, '2026-12-01')).toEqual(['Member census'])
    expect(missingData('employee_benefits', { fields: { member_count: '22', census: 'attached (22 members)' } }, '2026-12-01')).toEqual([])
  })
  it('construction reads the contract value from the limit and needs the period', () => {
    expect(missingData('construction_car', { limit: 'S$12,000,000', fields: { project: 'Example Depot' } }, null)).toEqual(['Construction period (months)'])
  })
  it('a start date from the inception or the period text', () => {
    expect(missingData('foreign_worker_medical', { fields: { worker_count: '12', worker_list: 'attached' } }, null)).toEqual(['Inception'])
    expect(missingData('foreign_worker_medical', { fields: { worker_count: '12', worker_list: 'attached' }, period: '12 months from 1 Dec 2026' }, null)).toEqual([])
  })
  it('a line without required data is never held', () => {
    expect(missingData('iar_fire', { fields: {} }, null)).toEqual([])
  })
  it('asks the client in plain words, once per item', () => {
    expect(missingAsks('employee_benefits', { fields: {} }, null)).toEqual(['The member census: date of birth, gender, plan and dependants for each member', 'The date cover should start'])
    expect(missingAsks('construction_car', { fields: {} }, '2026-12-01')).toEqual(['The letter of award or contract, with the project title, contract value and construction period'])
  })
})

describe('submissions', () => {
  it('WICA in the format Catherine sends', () => {
    const t = sub('wica', { business: 'Technical testing', uen: '202213795N', categories: 'Lab technician: 4, S$160,885', claims_history: 'Nil', incumbent: 'Liberty' })
    expect(t).toMatch(/Nature of business: Technical testing/)
    expect(t).toMatch(/UEN No: 202213795N/)
    expect(t).toMatch(/Date of renewal: 1 Dec 2026/)
    expect(t).toMatch(/Claims history, last three years: Nil/)
  })
  it('GPA, FWMI, employee benefits and motor name the client and the deadline', () => {
    for (const [l, f] of [['group_personal_accident', { insured_persons: '35,000 bikes', benefits: 'Death and PD S$10,000' }], ['foreign_worker_medical', { worker_count: '12', with_bond: 'yes' }], ['employee_benefits', { member_count: '22' }], ['commercial_vehicle', { vehicle_count: '9' }]] as const) {
      const t = sub(l, f as Record<string, string>)
      expect(t).toMatch(/Example Pte Ltd/)
      expect(t).toMatch(/by 10 Nov 2026/)
    }
    expect(sub('foreign_worker_medical', { worker_count: '12', with_bond: 'yes' })).toMatch(/Foreign worker bond: required/)
  })
})

describe('the data request to the client', () => {
  it('numbers every item, offers the appointment letter, says what happens next', () => {
    const d = buildDraft('request_quote_data', { title: 'WICA', items: ['The nature of your business', 'Headcount by category of work, with the estimated annual wages for each category'], threadSubject: 'WIC quote', greetingName: 'Mei' } as never)
    expect(d.subject).toBe('Re: WIC quote')
    expect(d.body).toMatch(/^Dear Mei,/)
    expect(d.body).toMatch(/1\. The nature of your business\n2\. Headcount/)
    expect(d.body).toMatch(/signed letter appointing us/)
    expect(d.body).toMatch(/come back to you with a comparison/)
  })
})

describe('the 90-day renewal data request', () => {
  it('lists what the line needs, numbered', () => {
    const d = buildDraft('renewal_notice', { title: 'Renewal', className: 'Work Injury Compensation', policyNumber: 'W1', insurerName: 'Liberty', expiry: '2026-12-31', items: LINE_SPECS.wica.documentsToAsk, greetingName: 'Mei' } as never)
    expect(d.body).toMatch(/1\. Headcount by category of work, with estimated annual wages/)
    expect(d.body).toMatch(/a short confirmation is enough/)
  })
  it('falls back to the general ask with no line items', () => {
    expect(buildDraft('renewal_notice', { title: 'Renewal', className: 'Policy', expiry: '2026-12-31' } as never).body).toMatch(/Please confirm any changes since the last renewal/)
  })
})

describe('liability', () => {
  it('tells the four flows apart and picks the panel by flow', async () => {
    const { liabilityFlow, pickPanel } = await import('@/lib/placement/lines')
    const contract = { fields: { purpose: 'MCST requires standalone PL for office renovation', requirement: 'Standalone PL S$2m', business: 'Renovation contractor', limit: 'S$2,000,000' } }
    const products = { fields: { purpose: 'product liability', business: 'Health supplements, exported to the USA', limit: 'S$5,000,000' } }
    const sme = { fields: { purpose: 'annual business cover', business: 'Retail mobile phone shop', limit: 'S$1,000,000' } }
    expect(liabilityFlow(contract)).toBe('contract')
    expect(liabilityFlow(products)).toBe('products')
    expect(liabilityFlow(sme)).toBe('sme')
    const all = ['Great Eastern General', 'MSIG Insurance', 'EQ Insurance', 'Chubb Insurance', 'AXA XL', 'BHSI', 'Liberty', 'HLAS']
    expect(pickPanel('general_liability', contract, all)[0]).toBe('EQ Insurance')
    expect(pickPanel('general_liability', products, all)).toEqual(['Chubb Insurance', 'AXA XL', 'BHSI'])
    expect(pickPanel('general_liability', sme, all)[0]).toBe('Great Eastern General')
  })
  it('holds a request with no purpose, and asks why the cover is needed', () => {
    expect(missingData('general_liability', { fields: { business: 'Events', limit: 'S$1m' } }, null)).toEqual(['Purpose'])
    expect(missingAsks('general_liability', { fields: { business: 'Events', limit: 'S$1m' } }, null)[0]).toMatch(/^Why the cover is needed/)
  })
  it('quotes the requirement clause and asks the insurer to confirm the parties', () => {
    const t = sub('general_liability', { purpose: 'Contract requirement', business: 'M&E works', limit: 'S$2 mil per occurrence', requirement: 'Commercial general liability of not less than $2,000,000 per occurrence', insureds: 'the Principal as additional insured', period: '1 Sep 2026 to 31 Aug 2027 + 24 months completed operations' })
    expect(t).toMatch(/Insurance required:\nCommercial general liability/)
    expect(t).toMatch(/Kindly confirm the wording meets the requirement above and that the parties named can be included/)
    expect(t).toMatch(/Period of insurance: 1 Sep 2026 to 31 Aug 2027 \+ 24 months completed operations/)
  })
})

describe('preventing the liability breaks', () => {
  it('remembers a decline for a similar risk, not for any risk', async () => {
    const { similarRisk } = await import('@/lib/placement/lines')
    expect(similarRisk('Health supplements and nutraceutical products, exported', 'Nutraceutical health supplements distributor')).toBe(true)
    expect(similarRisk('Senior companion and befriending services', 'Befriending and companion care for seniors')).toBe(true)
    expect(similarRisk('Health supplements distributor', 'Mechanical and electrical contractor')).toBe(false)
    expect(similarRisk('', 'anything')).toBe(false)
  })
  it('reads the required limit from the request', async () => {
    const { requiredLimit } = await import('@/lib/placement/lines')
    expect(requiredLimit({ fields: { limit: 'S$2,000,000 per occurrence' } })).toBe(2_000_000)
    expect(requiredLimit({ limit: 'SGD 1 million' })).toBe(1_000_000)
    expect(requiredLimit({})).toBeNull()
  })
  it('a chase is drafted without the model', async () => {
    const { chaseTemplate } = await import('@/lib/placement/workflow')
    const t = chaseTemplate({ insurerName: 'EQ Insurance', clientName: 'Example Pte Ltd', lineLabel: 'Public liability', sentOn: '2026-10-01', chaseNo: 1, inceptionDate: '2026-11-15' })
    expect(t).toMatch(/May I check on our request for Public liability for Example Pte Ltd, sent on 1 Oct 2026\? Cover is needed from 15 Nov 2026\./)
    expect(chaseTemplate({ insurerName: 'EQ', clientName: 'X', lineLabel: 'PL', sentOn: '2026-10-01', chaseNo: 3, inceptionDate: null })).toMatch(/If you are not able to quote, do let us know/)
  })
})
