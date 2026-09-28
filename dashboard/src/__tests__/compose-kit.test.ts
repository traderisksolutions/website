import { describe, it, expect } from 'vitest'
import { externalDomain } from '@/components/engagement-agent/compose-toolbar'

// The "External recipient · domain" footer note in the New email dialog.
describe('externalDomain', () => {
  it('is null for a trade-risksol.com address, any case', () => {
    expect(externalDomain('hasya@trade-risksol.com')).toBeNull()
    expect(externalDomain('  Ops@Trade-RiskSol.com ')).toBeNull()
  })

  it('returns the lower-cased domain for an outside address', () => {
    expect(externalDomain('lcheng@Sompo-Intl.com')).toBe('sompo-intl.com')
  })

  it('is null while the address is incomplete', () => {
    expect(externalDomain('')).toBeNull()
    expect(externalDomain('lcheng')).toBeNull()
    expect(externalDomain('lcheng@')).toBeNull()
  })
})
