import { describe, expect, it } from 'vitest'
import { cn, RADIUS_SCALE, TYPE_SCALE } from '@/lib/utils'

describe('four type sizes', () => {
  it('keeps a scale size beside a colour token', () => {
    expect(cn('text-13', 'text-trs-ink')).toBe('text-13 text-trs-ink')
    expect(cn('text-12.5 text-trs-muted', 'font-medium')).toBe('text-12.5 text-trs-muted font-medium')
  })

  it('lets a later size replace an earlier one, and a later colour replace an earlier colour', () => {
    expect(cn('text-13', 'text-14')).toBe('text-14')
    expect(cn('text-trs-ink', 'text-trs-muted')).toBe('text-trs-muted')
  })

  it('matches the sizes in tailwind.config.ts', async () => {
    const config = (await import('../../tailwind.config')).default as { theme: { extend: { fontSize: Record<string, string> } } }
    for (const k of TYPE_SCALE) expect(config.theme.extend.fontSize[k]).toBeDefined()
    // Four sizes only, whatever the name.
    expect(new Set(Object.values(config.theme.extend.fontSize))).toEqual(new Set(['24px', '16px', '14px', '12px']))
  })
})

describe('one radius', () => {
  it('keeps a radius beside a border, and a later radius replaces an earlier one', () => {
    expect(cn('rounded-7', 'border-trs-line')).toBe('rounded-7 border-trs-line')
    expect(cn('rounded-7', 'rounded-10')).toBe('rounded-10')
  })

  it('matches the radii in tailwind.config.ts', async () => {
    const config = (await import('../../tailwind.config')).default as { theme: { extend: { borderRadius: Record<string, string> } } }
    // One radius, whatever the name.
    for (const r of RADIUS_SCALE) expect(config.theme.extend.borderRadius[r]).toBe('var(--radius-one)')
    expect(new Set(Object.values(config.theme.extend.borderRadius))).toEqual(new Set(['var(--radius-one)']))
  })
})
