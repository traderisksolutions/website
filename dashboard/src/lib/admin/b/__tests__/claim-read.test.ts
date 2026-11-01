import { describe, it, expect } from 'vitest'
import {
  claimClass, findInsurerRef, findPolicyNumber, findClaimedAmount, findSettledAmount, findLossDate, findClaimant,
  inferStage, waitingOn, documentState, claimGaps, type MailLine,
} from '../claim-read'
import { parseWrittenDate, workingDaysBetween, addDays } from '../dates'

describe('dates', () => {
  it('reads day-first written dates', () => {
    expect(parseWrittenDate('18/09/2026')).toBe('2026-09-18')
    expect(parseWrittenDate('18-9-26')).toBe('2026-09-18')
    expect(parseWrittenDate('2026-09-18')).toBe('2026-09-18')
    expect(parseWrittenDate('18th Sep 2026')).toBe('2026-09-18')
    expect(parseWrittenDate('September 18, 2026')).toBe('2026-09-18')
    expect(parseWrittenDate('31/02/2026')).toBeNull()
    expect(parseWrittenDate('soon')).toBeNull()
  })
  it('counts Monday to Friday only', () => {
    // Fri 30 Oct 2026 → Fri 6 Nov 2026: Mon–Fri = 5
    expect(workingDaysBetween('2026-10-30', '2026-11-06')).toBe(5)
    expect(workingDaysBetween('2026-10-31', '2026-11-01')).toBe(0) // Sat → Sun
    expect(workingDaysBetween('2026-11-06', '2026-10-30')).toBe(0)
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('claimClass', () => {
  it('prefers the policy on file over the mail', () => {
    expect(claimClass('Work Injury Compensation', 'van accident')).toBe('wica')
    expect(claimClass(null, 'Our van was in an accident on the PIE')).toBe('motor')
    expect(claimClass('Group Hospitalisation and Surgical', '')).toBe('ghs')
    expect(claimClass('Fire', '')).toBe('property')
    expect(claimClass(null, 'nothing useful')).toBe('other')
  })
})

describe('readers', () => {
  const mail = `Dear Sir,\nWe refer to Claim No: CLM/2026/00412 under policy POL-77-1234.\nDate of loss: 18/09/2026\nClaimant: Tan Ah Kow\nThe total claim amount is S$18,400.00.\nRegards`
  it('finds the insurer claim reference and never the policy number', () => {
    expect(findInsurerRef(mail, ['POL-77-1234'])?.value).toBe('CLM/2026/00412')
    expect(findInsurerRef('our ref POL-77-1234', ['POL-77-1234'])).toBeNull()
    expect(findInsurerRef('claim number pending')).toBeNull()
  })
  it('only returns a policy number TRS already holds', () => {
    expect(findPolicyNumber(mail, ['POL-77-1234', 'OTHER-1'])?.value).toBe('POL-77-1234')
    expect(findPolicyNumber(mail, ['NOT-THERE-9'])).toBeNull()
  })
  it('reads amounts only beside claim or settlement words', () => {
    expect(findClaimedAmount(mail)?.value).toBe(18400)
    expect(findClaimedAmount('Your premium is S$1,200.')).toBeNull()
    expect(findSettledAmount('We are pleased to offer S$ 15,000 in full settlement.')?.value).toBe(15000)
  })
  it('reads the loss date and claimant after their labels', () => {
    expect(findLossDate(mail)?.value).toBe('2026-09-18')
    expect(findLossDate('The accident happened on 7 Oct 2026 at Jurong')?.value).toBe('2026-10-07')
    expect(findClaimant(mail)?.value).toBe('Tan Ah Kow')
    expect(findClaimant('no label here')).toBeNull()
  })
})

describe('inferStage', () => {
  const l = (side: MailLine['side'], sent_at: string, text: string, extra: Partial<MailLine> = {}): MailLine => ({ side, sent_at, text, ...extra })
  it('moves forward with the mail', () => {
    const lines = [
      l('client', '2026-09-22', 'We had damage at the unit, photos attached'),
      l('trs', '2026-09-30', 'Please find attached the claim submission for the damage', { toInsurer: true }),
      l('insurer', '2026-10-12', 'Kindly provide the documents in PDF'),
    ]
    expect(inferStage(lines).stage).toBe('documents_pending')
    expect(inferStage(lines.slice(0, 2)).stage).toBe('with_insurer')
  })
  it('a close sticks unless another close follows', () => {
    const lines = [
      l('insurer', '2026-10-01', 'We regret the claim has been declined as it is not covered under the policy'),
      l('client', '2026-10-02', 'Please provide the reason'),
    ]
    expect(inferStage(lines).stage).toBe('declined')
    expect(inferStage([...lines, l('insurer', '2026-10-20', 'Following review, the claim has been settled')]).stage).toBe('settled')
  })
  it('ignores a client asking for documents', () => {
    expect(inferStage([l('client', '2026-10-01', 'please provide the claim form')]).stage).toBe('notified')
  })
})

describe('waitingOn', () => {
  it('waits on TRS when the other side spoke last, on the addressee when TRS did', () => {
    expect(waitingOn([{ side: 'client', sent_at: '2026-10-01', text: '' }], 'notified')).toBe('trs')
    expect(waitingOn([{ side: 'trs', sent_at: '2026-10-01', text: '', toInsurer: true }], 'with_insurer')).toBe('insurer')
    expect(waitingOn([{ side: 'trs', sent_at: '2026-10-01', text: '' }], 'documents_pending')).toBe('client')
    expect(waitingOn([{ side: 'client', sent_at: '2026-10-01', text: '' }], 'settled')).toBeNull()
  })
  it('does not count rebuilt messages as received', () => {
    const lines: MailLine[] = [
      { side: 'trs', sent_at: '2026-10-01', text: '', toInsurer: true },
      { side: 'client', sent_at: '2026-10-05', text: '', rebuilt: true },
    ]
    expect(waitingOn(lines, 'with_insurer')).toBe('insurer')
  })
})

describe('reference and class edge cases', () => {
  it('reads "Claim Reference No." and a bare claim number, not dates or years', () => {
    expect(findInsurerRef('Claim Reference No. H0000019883: please provide')?.value).toBe('H0000019883')
    expect(findInsurerRef('Formal request for reassessment – Claim 7551245')?.value).toBe('7551245')
    expect(findInsurerRef('the claim 18/09/2026 was')).toBeNull()
    expect(findInsurerRef('claim 2026 renewal')).toBeNull()
  })
  it('reads CAR as contractors all risk, a car as motor', () => {
    expect(claimClass(null, 'CAR Policy No. X1 - site incident')).toBe('property')
    expect(claimClass(null, 'my car was hit')).toBe('motor')
  })
  it('reads USD and ignores tiny figures', () => {
    expect(findSettledAmount('total settlement offer to USD 268,000 when')?.value).toBe(268000)
    expect(findSettledAmount('payment of $10 fee')).toBeNull()
    expect(findClaimedAmount('the claim amount is up to annual policy limit of $60,000')).toBeNull()
  })
})

describe('documents and gaps', () => {
  it('ticks items by file name and lists the rest as gaps', () => {
    const docs = documentState('motor', ['GIA accident report.pdf', 'IMG_0001.jpg'])
    expect(docs.filter(d => d.received).map(d => d.item)).toEqual(['Accident report', 'Photos'])
    const gaps = claimGaps(docs, ['Landlord letter.pdf'], 'motor')
    expect(gaps.map(g => g.item)).toEqual(['Repair estimate', 'Driving licence', 'Landlord letter.pdf'])
    expect(gaps[2].basis).toMatch(/does not hold/)
  })
})
