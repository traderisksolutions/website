import { describe, it, expect } from 'vitest'
import { readReportToken, reportToken } from '@/lib/gb/report-link'

// The client report links sent on WhatsApp before 20 Nov 2026 stay readable until they expire.
describe('report link', () => {
  const key = 'k'.repeat(32), now = Date.UTC(2026, 10, 13)
  it('opens for 30 days and refuses a changed or expired token', () => {
    const t = reportToken('1AbCdEfGhIjKlMnOp', now, key)
    expect(readReportToken(t, now, key)).toBe('1AbCdEfGhIjKlMnOp')
    expect(readReportToken(t, now + 31 * 86_400_000, key)).toBeNull()
    expect(readReportToken(t.replace('1AbC', '1AbD'), now, key)).toBeNull()
    expect(readReportToken(t, now, 'x'.repeat(32))).toBeNull()
    expect(readReportToken('../../etc', now, key)).toBeNull()
  })
})
