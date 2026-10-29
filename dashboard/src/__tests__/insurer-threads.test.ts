import { describe, expect, it } from 'vitest'
import { guessPolicy, insurerByDomain, insurerFromSubject, sameInsurer, type InsurerRef, type PolicyRef } from '@/lib/insurers/threads'

const ins: InsurerRef[] = [
  { id: 'ge', company_name: 'GREAT EASTERN', domain: 'greateasterngeneral.com', domains: null },
  { id: 'qbe', company_name: 'QBE', domain: 'qbe.com', domains: null },
  { id: 'ct', company_name: 'CHINA TAPING (CTPIS)', domain: 'sg.cntaiping.com', domains: null },
  { id: 'bh', company_name: 'BHSI', domain: 'bhspecialty.com', domains: null },
  { id: 'ergo', company_name: 'ERGO', domain: 'ergo.com.sg', domains: null },
]
const pol = (id: string, o: Partial<PolicyRef>): PolicyRef => ({ id, company_id: 'c1', insurer: null, policy_number: null, class_of_insurance: null, label: null, ...o })

describe('insurer matching', () => {
  it('matches the sender domain, subdomains included', () => {
    expect(insurerByDomain('greateasterngeneral.com', ins)?.id).toBe('ge')
    expect(insurerByDomain('mail.qbe.com', ins)?.id).toBe('qbe')
    expect(insurerByDomain('gmail.com', ins)).toBeNull()
  })
  it.each([
    ['Re: (TRS) GE - Weima (259 JLN AHMAD IBRAHIM - VDL SQ2)', 'ge'],
    ['RE: TRS( QBE) : Beijing Gas Singapore Pte Ltd- Policy Renewal', 'qbe'],
    ['(TRS) CTPIS - CHEC Stevens Road', 'ct'],
    ['Re: (TRS) Ergo - Weima (259 Jln Ahmad Ibrahim - VDL SQ2)', 'ergo'],
  ])('reads the insurer from "%s"', (subject, id) => expect(insurerFromSubject(subject, ins)?.id).toBe(id))
  it('ignores subjects without the TRS convention', () => expect(insurerFromSubject('Renewal for White Horse Laboratories', ins)).toBeNull())
  it('treats short and legal names as one insurer', () => {
    expect(sameInsurer('Berkshire Hathaway Specialty Insurance', 'BHSI')).toBe(true)
    expect(sameInsurer('Great Eastern General Insurance Limited', 'GREAT EASTERN')).toBe(true)
    expect(sameInsurer('QBE Insurance (Singapore) Pte Ltd', 'LIBERTY')).toBe(false)
  })
})

describe('guessPolicy', () => {
  const ps = [
    pol('a', { insurer: 'QBE Insurance (Singapore) Pte Ltd', policy_number: 'N0018530', label: 'Employee Benefit Insurance' }),
    pol('b', { insurer: 'QBE Insurance (Singapore) Pte Ltd', policy_number: 'WC-77', label: 'Work Injury Compensation' }),
    pol('c', { insurer: 'Liberty Insurance', label: 'Fire' }),
  ]
  it('takes the policy number in the subject', () => expect(guessPolicy('Renewal N0018530 Beijing Gas', 'c1', 'QBE', ps)).toMatchObject({ policy_id: 'a', how: 'policy no. in subject' }))
  it('takes the cover named in the subject', () => expect(guessPolicy('(TRS) QBE - Work injury claim', 'c1', 'QBE', ps)).toMatchObject({ policy_id: 'b', how: 'cover named in subject' }))
  it('takes the only policy with that insurer', () => expect(guessPolicy('Anything', 'c1', 'LIBERTY', ps).policy_id).toBe('c'))
  it('leaves several candidates to the agent', () => expect(guessPolicy('Hello', 'c1', 'QBE', ps)).toMatchObject({ policy_id: null, how: 'several policies' }))
  it('needs a client', () => expect(guessPolicy('Hello', null, 'QBE', ps).how).toBe('thread has no client'))
})
