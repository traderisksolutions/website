import { describe, expect, it } from 'vitest'
import { classifyByName, dataRoomStatus, documentFileName, isNoise, policyFolderName, requiredDocs } from '@/lib/documents/taxonomy'
import { cleanRead, matchPolicy, type PolicyCandidate } from '@/lib/documents/classify'
import { lifecycleFor, policyFromDocument, productLineFor } from '@/lib/documents/policy'
import { portfolio } from '@/lib/companies/portfolio'

describe('classifyByName', () => {
  it.each([
    ['Confirmation Hold Cover - KAI ASSOCIATES (M) SDN BHD.pdf', 'cover_note'],
    ['TRS DN260708- Empyrion DC- 1 Additional staff in April.pdf', 'trs_debit_note'],
    ['GE FWMI- Healthway Medical - FWMI- Tax Invoice.pdf', 'insurer_debit_note'],
    ['TRS CN260712 (Empyrion DC- Staff Termination).pdf', 'credit_note'],
    ['Bejing Gas - Employee Member Listing for 2026 Renewal - QBE quote.xlsx', 'member_list'],
    ["Marsh Directors' and Officers' Liability Proposal Form with ODL Schedule.pdf", 'proposal_form'],
    ['QBE Group Medical-Medical Prestige Plan_Policy Wording_0824.pdf', 'policy_wording'],
    ['Renewal Notice - Beijing Gas.pdf', 'renewal_notice'],
    ['Claims History - Beijing Gas - Sept2025 to July 2026.xlsx', 'claims_history'],
    ['FOREIGN WORKER MEDICAL CLAIM FORM (SHEE CHEE CHENG).pdf', 'claim'],
    ['TRS_-_Letter_of_Broker_Appointment_Hougang.pdf', 'broker_appointment'],
    ['PALM Investment Management Pte Ltd Policy 2026.pdf', 'policy_schedule'],
    ['Red Beacon_2026_IMI quote - BHSI .pdf', 'quotation'],
  ])('%s → %s', (f, t) => expect(classifyByName(f)).toBe(t))
  it('returns null when the name says nothing', () => expect(classifyByName('2026-10-07-13-15-30-01.pdf')).toBeNull())
})

describe('isNoise', () => {
  it('drops signature images and keeps a scanned claim receipt', () => {
    expect(isNoise('image001.png')).toBe(true)
    expect(isNoise('Outlook-Empyrion D.png')).toBe(true)
    expect(isNoise('Eagles eye Receipt - 13 Apr.jpg')).toBe(false)
    expect(isNoise('Policy.pdf')).toBe(false)
  })
})

describe('data room status', () => {
  it('asks a live liability policy for proposal, claims history, DN, schedule and wording', () => {
    expect(requiredDocs({ lifecycle: 'live', is_eb: false, product_line: 'professional_indemnity' }).map(r => r.slug))
      .toEqual(['proposal_form', 'claims_history', 'trs_debit_note', 'policy_schedule', 'policy_wording'])
  })
  it('counts a bound policy complete with a cover note in place of a schedule', () => {
    const s = dataRoomStatus({ lifecycle: 'bound', is_eb: false, product_line: 'inland_transit' }, ['proposal_form', 'cover_note', 'trs_debit_note'])
    expect(s.state).toBe('complete')
  })
  it('lists what is missing', () => {
    const s = dataRoomStatus({ lifecycle: 'live', is_eb: true, product_line: 'group_health' }, ['benefit_summary', 'trs_debit_note'])
    expect(s.state).toBe('pending')
    expect(s.missing.map(m => m.label)).toEqual(['Proposal form', 'Member list', 'Policy wording'])
  })
  it('asks nothing of a lapsed policy', () => expect(dataRoomStatus({ lifecycle: 'lapsed', is_eb: false, product_line: null }, []).state).toBe('none'))
})

describe('Drive names', () => {
  it('names the policy folder by year, cover and insurer', () => {
    expect(policyFolderName({ label: 'Goods in Transit', insurer: 'Great Eastern General', start_date: '2026-10-28', policy_number: null })).toBe('2026–27 Goods in Transit · Great Eastern General')
  })
  it('names the file by date, type and insurer', () => {
    expect(documentFileName({ received_at: '2026-10-28T09:09:00Z', doc_type: 'cover_note', insurer_name: 'Great Eastern', filename: 'Confirmation Hold Cover - KAI.PDF' }))
      .toBe('2026-10-28 · Cover note · Great Eastern · Confirmation Hold Cover - KAI.pdf')
  })
})

describe('cleanRead', () => {
  it('trusts a confident read over the filename', () => {
    expect(cleanRead({ doc_type: 'policy_schedule', confidence: 0.9 }, 'scan.pdf').doc_type).toBe('policy_schedule')
  })
  it('keeps the filename type over a weak read', () => {
    expect(cleanRead({ doc_type: 'quotation', confidence: 0.3 }, 'Tax Invoice.pdf').doc_type).toBe('insurer_debit_note')
  })
  it('drops unknown types and bad dates', () => {
    const r = cleanRead({ doc_type: 'banana', period_from: '28/10/2026', confidence: 0.9 }, 'x.pdf')
    expect(r.doc_type).toBe('other')
    expect(r.period_from).toBeNull()
  })
})

const pol = (id: string, o: Partial<PolicyCandidate>): PolicyCandidate => ({ id, policy_number: null, cover_note_no: null, insurer: null, class_of_insurance: null, label: null, start_date: null, end_date: null, lifecycle: 'live', ...o })

describe('matchPolicy', () => {
  const policies = [
    pol('a', { policy_number: 'GHS-26-118402', insurer: 'Allianz Insurance Singapore', start_date: '2026-12-01', end_date: '2027-11-30' }),
    pol('b', { insurer: 'MSIG', start_date: '2025-12-01', end_date: '2026-11-30' }),
    pol('c', { insurer: 'MSIG', start_date: '2026-12-01', end_date: '2027-11-30' }),
  ]
  it('matches the policy number whatever the punctuation', () => expect(matchPolicy({ policy_number: 'GHS 26 118402', insurer_name: null, period_from: null, period_to: null }, policies)).toBe('a'))
  it('picks the insurer policy whose period covers the document', () => expect(matchPolicy({ policy_number: null, insurer_name: 'MSIG Insurance (Singapore)', period_from: '2026-12-05', period_to: null }, policies)).toBe('c'))
  it('leaves an ambiguous document unsorted', () => expect(matchPolicy({ policy_number: null, insurer_name: 'MSIG', period_from: null, period_to: null }, policies)).toBeNull())
})

describe('policy from a document', () => {
  it('reads the line and the lifecycle', () => {
    expect(productLineFor('Good In Transit')).toBe('inland_transit')
    expect(lifecycleFor('cover_note', '2026-11-30', '2026-10-29')).toBe('bound')
    expect(lifecycleFor('policy_schedule', '2026-01-01', '2026-10-29')).toBe('lapsed')
  })
  it("builds Ernest's Great Eastern hold cover as a bound policy in ringgit", () => {
    const row = policyFromDocument({ company_id: 'k', doc_type: 'cover_note', insurer_name: 'Great Eastern General Insurance (Malaysia) Berhad', policy_number: 'NMMKB045', period_from: '2026-10-28', period_to: '2026-11-30', premium_text: 'RM 36,578.04', title: 'Hold cover' }, 'Good In Transit')
    expect(row).toMatchObject({ product_line: 'inland_transit', cover_note_no: 'NMMKB045', policy_number: null, premium: 36578.04, currency: 'MYR', start_date: '2026-10-28', end_date: '2026-11-30' })
  })
})

describe('portfolio', () => {
  it('counts every state a company is in at once', () => {
    expect(portfolio([{ lifecycle: 'live' }, { lifecycle: 'live' }, { lifecycle: 'quoting' }, { lifecycle: 'renewal_due' }, { lifecycle: 'closed' }]))
      .toEqual([{ key: 'in_force', label: 'in force', tone: 'green', count: 2 }, { key: 'quoting', label: 'quoting', tone: 'blue', count: 1 }, { key: 'renewal_due', label: 'renewal due', tone: 'amber', count: 1 }])
  })
})
