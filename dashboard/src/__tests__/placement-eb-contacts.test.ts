import { describe, expect, it } from 'vitest'
import { ebEmailContacts, EB_PRODUCT_LINE } from '@/lib/placement/auto'

const picks = [
  { contact_id: 'c-income', insurer: 'Income Insurance Limited' },
  { contact_id: 'c-aia', insurer: 'AIA Singapore' },
  { contact_id: 'c-etiqa', insurer: 'Etiqa' },
  { contact_id: 'c-cigna', insurer: 'Cigna' },
  { contact_id: 'c-hl', insurer: 'HL Assurance' },
]

describe('ebEmailContacts', () => {
  it('emails only Tier C insurers on an employment-benefits line', () => {
    expect(ebEmailContacts(EB_PRODUCT_LINE, picks, [])).toEqual(['c-etiqa', 'c-cigna', 'c-hl'])
  })
  it('leaves Cigna out once its rate table is approved (Tier B)', () => {
    expect(ebEmailContacts(EB_PRODUCT_LINE, picks, ['Cigna Europe'])).toEqual(['c-etiqa', 'c-hl'])
  })
  it('keeps every insurer on other lines', () => {
    expect(ebEmailContacts('wica', picks, [])).toHaveLength(5)
  })
  it('asks a contact once', () => {
    expect(ebEmailContacts('wica', [...picks, picks[2]], [])).toHaveLength(5)
  })
})
