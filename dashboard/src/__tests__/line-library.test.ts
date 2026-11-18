import { describe, it, expect } from 'vitest'
import { LINES, bodyFrom, isLineKey, isPart, rowsFrom, studyText } from '@/lib/placement/line-library'

describe('line library', () => {
  it('has the 14 lines with CAR and EAR apart', () => {
    expect(LINES).toHaveLength(14)
    expect(isLineKey('car') && isLineKey('ear')).toBe(true)
    expect(isLineKey('nope')).toBe(false)
  })

  it('starts every part from the study', () => {
    for (const l of LINES) {
      expect(studyText(l.key, 'to_insurer')).toMatch(/Dear/)
      expect(studyText(l.key, 'knowledge')).toMatch(/^Rounds: /)
      expect(rowsFrom(studyText(l.key, 'client_data')).length).toBeGreaterThan(0)
    }
  })

  it('cleans what is saved', () => {
    expect(isPart('knowledge')).toBe(true)
    expect(isPart('other')).toBe(false)
    expect(bodyFrom('to_client', '  Dear X,\r\nThanks  ')).toBe('Dear X,\nThanks')
    expect(bodyFrom('to_client', '   ')).toBeNull()
    expect(bodyFrom('to_client', 3)).toBeNull()
    expect(rowsFrom(bodyFrom('client_data', [{ item: ' Title ', detail: 'Caps', seen: '24' }, { item: '', detail: 'x' }])!)).toEqual([{ item: 'Title', detail: 'Caps', seen: '24' }])
    expect(bodyFrom('insurer_asks', 'not rows')).toBeNull()
    expect(rowsFrom('{bad')).toEqual([])
  })
})
