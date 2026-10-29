import { describe, expect, it } from 'vitest'
import { senderIsInsurer } from '@/lib/policies/inbound'

const aia = { company_name: 'AIA', domains: ['aia.com'], domain: 'aia.com' }
const qbeNoDomain = { company_name: 'QBE Insurance (Singapore) Pte Ltd', domains: [], domain: null }

describe('is the sender the insurer', () => {
  it('by the insurer’s own domains', () => {
    expect(senderIsInsurer('aia.com', aia, 'AIA')).toBe(true)
    expect(senderIsInsurer('sg.aia.com', aia, 'AIA')).toBe(true)
  })
  it('a client whose domain contains the insurer’s letters is not the insurer', () => {
    expect(senderIsInsurer('malaysia-trading.com', aia, 'AIA')).toBe(false)
    expect(senderIsInsurer('dogfood-client.invalid', { company_name: 'Dogfood Assurance', domains: ['dogfood-insurer.invalid'], domain: null }, 'Dogfood Assurance')).toBe(false)
  })
  it('no domain on record: a domain label that is the insurer’s name', () => {
    expect(senderIsInsurer('qbe.com', qbeNoDomain, 'QBE')).toBe(true)
    expect(senderIsInsurer('mail.qbe.com', qbeNoDomain, 'QBE')).toBe(true)
    expect(senderIsInsurer('barbeque.com', qbeNoDomain, 'QBE')).toBe(false)
  })
})
