import { describe, expect, it } from 'vitest'
import { betterRead, inferProductLine, isQuoteLike, parseDate, readQuoteText } from '@/lib/placement/quote-read'

// Fixtures are invented; no real client, insurer contact or policy appears here.
const QUOTE_BODY = `Dear Broker,

We are pleased to offer our quotation for Work Injury Compensation for Example Builders Pte Ltd as follows:

Period of Insurance: 01/12/2026 to 30/11/2027
Limit of Liability: S$10,000,000 any one accident
Excess: S$500 each and every claim
Annual Premium: S$4,250.00 (excl. GST)
GST (9%): S$382.50
Quote is valid for 30 days.
Subject to: declaration of estimated annual wages; no known claims in the past 3 years.

Regards,
Underwriter`

const INDICATION = `Hi, an indicative premium for the cyber cover would be around SGD 12,000 per annum, subject to full underwriting. Limit USD 1M.`

const BIND = `We confirm that cover is bound with effect from 1 Nov 2026 under Policy No. CGL-2026-00123. The policy schedule will follow.`

describe('readQuoteText', () => {
  it('reads a full quotation with its figures and excerpts', () => {
    const q = readQuoteText(QUOTE_BODY, { sentAt: '2026-11-03T02:00:00Z' })!
    expect(q.kind).toBe('quotation')
    expect(q.premium_text).toBe('S$4,250.00')
    expect(q.premium_amount).toBe(4250)
    expect(q.currency).toBe('SGD')
    expect(q.gst_amount).toBe(382.5)
    expect(q.limit_amount).toBe(10_000_000)
    expect(q.excess_text).toMatch(/S\$500/)
    expect(q.period_from).toBe('2026-12-01')
    expect(q.period_to).toBe('2027-11-30')
    expect(q.valid_until).toBe('2026-12-03')
    expect(q.conditions.length).toBeGreaterThan(0)
    expect(q.evidence.premium?.excerpt).toContain('S$4,250.00')
    expect(q.confidence).toBe('high')
  })
  it('reads an indication as such, with its currency', () => {
    const q = readQuoteText(INDICATION)!
    expect(q.kind).toBe('indication')
    expect(q.premium_amount).toBe(12_000)
    expect(q.currency).toBe('SGD')
    expect(q.limit_amount).toBe(1_000_000)
    expect(q.confidence).toBe('high')
  })
  it('reads a bind confirmation with no premium', () => {
    const q = readQuoteText(BIND)!
    expect(q.kind).toBe('bind_confirmation')
    expect(q.policy_number).toBe('CGL-2026-00123')
    expect(q.premium_amount).toBeNull()
  })
  it('returns null for mail with no premium and no confirmation', () => {
    expect(readQuoteText('Thanks, noted. We will revert by Friday.')).toBeNull()
    expect(readQuoteText('Please find attached the invoice for S$1,000.')).toBeNull()
  })
  it('keeps thresholds, payments, questions and limits out of the premium', () => {
    expect(readQuoteText('This is subject to minimum combined annual premium of $100,000 for the scheme.')).toBeNull()
    expect(readQuoteText('Just to double-check: is it $2,670 or $3,670? The premium looks off.')).toBeNull()
    expect(readQuoteText('Attached is the revised quote to include cover up to S$50,000,000 with additional premium.')).toBeNull()
    expect(readQuoteText('Premium payment of S$183.12 received, thank you.')).toBeNull()
  })
  it('reads a per-head rate as per head, not as the premium', () => {
    const q = readQuoteText('Our quotation: Premium Rate: S$6+GST per pax, subject to minimum premium of S$2,000+GST. Period of insurance 01/01/2027 to 31/12/2027.')!
    expect(q.premium_amount).toBeNull()
    expect(q.per_head_amount).toBe(6)
  })
  it('reads a currency code glued to the digits', () => {
    const q = readQuoteText('We note that the USD10,000 premium is net of brokerage.')!
    expect(q.currency).toBe('USD')
    expect(q.premium_amount).toBe(10_000)
  })
  it('drops a bind sentence with neither policy number nor premium', () => {
    expect(readQuoteText('We confirm cover is bound as discussed. Schedule to follow.')).toBeNull()
  })
  it('never invents a premium from an unrelated amount', () => {
    const q = readQuoteText('Our quotation is attached. The sum insured is S$2,000,000.')
    // No premium figure in the text: the read is low confidence rather than a guessed premium.
    expect(q === null || q.premium_amount === null).toBe(true)
  })
})

describe('isQuoteLike', () => {
  it('needs quote words and a money figure, or a bind confirmation', () => {
    expect(isQuoteLike('RE: WICA renewal', QUOTE_BODY)).toBe(true)
    expect(isQuoteLike('RE: cover', BIND)).toBe(true)
    expect(isQuoteLike('Out of office', 'I am away until Monday.')).toBe(false)
    expect(isQuoteLike('Premium', 'Please find attached your premium notice.')).toBe(false)
  })
})

describe('inferProductLine', () => {
  it('reads the line from the subject first', () => {
    expect(inferProductLine('TRS (Insurer) : Example Builders — WICA renewal', 'cyber words in body')).toBe('wica')
    expect(inferProductLine('Directors & Officers quotation', '')).toBe('do')
    expect(inferProductLine('Group Hospitalisation & Surgical', '')).toBe('group_health')
    expect(inferProductLine("Contractors' All Risks — Project X", '')).toBe('construction_car')
    expect(inferProductLine('Lunch next week', 'see you then')).toBeNull()
  })
})

describe('parseDate', () => {
  it('reads the date forms insurers write', () => {
    expect(parseDate('15/10/2026')).toBe('2026-10-15')
    expect(parseDate('15 Oct 2026')).toBe('2026-10-15')
    expect(parseDate('15-Oct-26')).toBe('2026-10-15')
    expect(parseDate('October 15, 2026')).toBe('2026-10-15')
    expect(parseDate('2026-10-15')).toBe('2026-10-15')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('soon')).toBeNull()
  })
})

describe('betterRead', () => {
  it('prefers the read with a premium, then the higher confidence', () => {
    const a = readQuoteText(BIND)!, b = readQuoteText(QUOTE_BODY)!
    expect(betterRead(a, b)).toBe(b)
    expect(betterRead(b, a)).toBe(b)
    expect(betterRead(null, a)).toBe(a)
  })
})
