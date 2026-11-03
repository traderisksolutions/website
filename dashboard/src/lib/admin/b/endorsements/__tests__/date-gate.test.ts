import { describe, it, expect } from 'vitest'
import { dateGate, mailOpening, tentativeCue } from '../date-gate'

const mv = (o: Partial<{ kind: 'join' | 'leave' | 'change'; effective_on: string | null; last_day: string | null; detail: Record<string, unknown>; quote: string }>) =>
  ({ kind: 'join' as const, effective_on: null, last_day: null, detail: {}, quote: '', ...o })

describe('endorsement date gate', () => {
  it('holds a heads-up even when it names a month or date', () => {
    expect(dateGate(mv({ quote: 'Heads up, we are hiring Tan Ah Kow next month' }))).toEqual({ act: false, reason: 'tentative', cue: 'Heads up' })
    expect(dateGate(mv({ effective_on: '2026-12-01', quote: 'Tan Ah Kow will tentatively join on 1 Dec' })).act).toBe(false)
    expect(dateGate(mv({ effective_on: '2026-12-01', quote: 'Tan Ah Kow joining 1 Dec, pending his work pass' })).act).toBe(false)
    expect(dateGate(mv({ effective_on: '2026-12-01', quote: 'Tan Ah Kow - start date TBC' })).act).toBe(false)
  })
  it('acts on a confirmed hire with its date, a future date included', () => {
    expect(dateGate(mv({ effective_on: '2026-11-03', quote: 'Tan Ah Kow joined us on 3 Nov' }))).toEqual({ act: true })
    expect(dateGate(mv({ effective_on: '2026-12-01', quote: 'Tan Ah Kow will join on 1 Dec' }))).toEqual({ act: true })
  })
  it('holds a confirmed instruction that has no date', () => {
    expect(dateGate(mv({ quote: 'Please add Tan Ah Kow' }))).toEqual({ act: false, reason: 'no_date', cue: null })
    expect(dateGate(mv({ kind: 'leave', quote: 'Lim Bee Lian has resigned' }))).toEqual({ act: false, reason: 'no_date', cue: null })
    expect(dateGate(mv({ kind: 'leave', last_day: '2026-11-30', quote: 'Lim Bee Lian - last day 30 Nov' }))).toEqual({ act: true })
  })
  it('a name change needs no date; a plan change does', () => {
    expect(dateGate(mv({ kind: 'change', detail: { change: 'name', new_name: 'Lim Bee Hoon' }, quote: 'changed her name' }))).toEqual({ act: true })
    expect(dateGate(mv({ kind: 'change', detail: { plan: '2' }, quote: 'change to plan 2' })).act).toBe(false)
  })
  it('a "Heads up" over a list holds every name under it', () => {
    const body = 'Hi Nathan,\nHeads up on upcoming staff:\n1. Tan Ah Kow - 1 Dec\n2. Lim Bee Lian - 8 Dec\nThanks'
    const open = mailOpening('Staff', body)
    expect(dateGate(mv({ effective_on: '2026-12-01', quote: 'Tan Ah Kow - 1 Dec' }), open).act).toBe(false)
    expect(dateGate(mv({ effective_on: '2026-12-01', quote: 'Tan Ah Kow - 1 Dec' }), mailOpening('Staff', 'Hi Nathan,\nPlease add:\n1. Tan Ah Kow - 1 Dec')).act).toBe(true)
  })
  it('does not read ordinary words as tentative', () => {
    expect(tentativeCue('Please add the following staff effective 1 Nov. Kindly confirm once done.')).toBeNull()
    expect(tentativeCue('The date is confirmed: 1 Nov')).toBeNull()
    expect(tentativeCue('We are hiring two new drivers')).toBe('We are hiring')
  })
  it('reads a model mark of tentative', () => {
    expect(dateGate(mv({ effective_on: '2026-12-01', detail: { tentative: true } })).act).toBe(false)
  })
})
