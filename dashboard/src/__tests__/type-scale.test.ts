import { describe, expect, it } from 'vitest'
import { cn, RADIUS_SCALE, TYPE_SCALE } from '@/lib/utils'

describe('one type scale', () => {
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
    expect(Object.keys(config.theme.extend.fontSize).sort()).toEqual([...TYPE_SCALE].sort())
  })
})

describe('one radius scale', () => {
  it('keeps a radius beside a border, and a later radius replaces an earlier one', () => {
    expect(cn('rounded-7', 'border-trs-line')).toBe('rounded-7 border-trs-line')
    expect(cn('rounded-7', 'rounded-10')).toBe('rounded-10')
  })

  it('matches the radii in tailwind.config.ts', async () => {
    const config = (await import('../../tailwind.config')).default as { theme: { extend: { borderRadius: Record<string, string> } } }
    for (const r of RADIUS_SCALE) expect(config.theme.extend.borderRadius[r]).toBe(`${r}px`)
  })
})
