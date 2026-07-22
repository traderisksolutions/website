import { describe, it, expect } from 'vitest'
import { profileIsRunnable } from '@/lib/pm-profile'
import type { CellMapProfile } from '@/lib/pm-profile'

const withLineOutputs: CellMapProfile = {
  sheet: 'Calculator', rows: { start: 16, end: 115 },
  member_inputs: { date_of_birth: 'E' },
  coverage_lines: [{ code: 'HS', label: 'HS', inputs: { plan: 'J' }, output: 'N' }],
  totals: { grand: 'Z118' }, date_serial: true,
}

describe('profileIsRunnable', () => {
  it('accepts a profile with a per-line output on every coverage line', () => {
    expect(profileIsRunnable(withLineOutputs)).toBe(true)
  })

  it('accepts a profile with NO line outputs but a per_life_total column', () => {
    const p: CellMapProfile = { ...withLineOutputs, coverage_lines: [{ code: 'HS', label: 'HS', inputs: { plan: 'J' }, output: '' }], per_life_total: 'Y' }
    expect(profileIsRunnable(p)).toBe(true)
  })

  it('rejects when a line lacks both an output and there is no per_life_total', () => {
    const p: CellMapProfile = { ...withLineOutputs, coverage_lines: [{ code: 'HS', label: 'HS', inputs: { plan: 'J' }, output: '' }] }
    expect(profileIsRunnable(p)).toBe(false)
  })

  it('rejects missing DOB, empty coverage lines, or a line with no inputs', () => {
    expect(profileIsRunnable({ ...withLineOutputs, member_inputs: {} })).toBe(false)
    expect(profileIsRunnable({ ...withLineOutputs, coverage_lines: [] })).toBe(false)
    expect(profileIsRunnable({ ...withLineOutputs, coverage_lines: [{ code: 'HS', label: 'HS', inputs: {}, output: 'N' }] })).toBe(false)
  })

  it('guards null / no sheet / bad rows', () => {
    expect(profileIsRunnable(null)).toBe(false)
    expect(profileIsRunnable({ ...withLineOutputs, sheet: '' })).toBe(false)
    expect(profileIsRunnable({ ...withLineOutputs, rows: { start: 0, end: 0 } })).toBe(false)
  })
})
