import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickRoute, type RouteTable } from '@/lib/actions/route-gateway'

// The three gateways' tables, read from their files (they are 'use server' modules).
function table(file: string): RouteTable {
  const pats = [...readFileSync(file, 'utf8').matchAll(/pattern: '([^']+)'/g)].map(m => m[1])
  return pats.map(pattern => ({ pattern, load: async () => ({}) }))
}
const sample = (p: string) => p.replace(/\[(\w+)\]/g, '00000000-0000-0000-0000-000000000001')

describe('route gateway', () => {
  for (const f of ['src/app/nexus/gateway.ts', 'src/app/placements/gateway.ts', 'src/app/engagement/gateway.ts']) {
    it(`every path in ${f.split('/')[2]} reaches its own handler, never an [id] neighbour`, () => {
      const t = table(f)
      expect(t.length).toBeGreaterThan(5)
      for (const r of t) expect(pickRoute(t, sample(r.pattern))?.r.pattern).toBe(r.pattern)
    })
  }

  it('reads the [id] from the path and answers null for a path it does not hold', () => {
    const t = table('src/app/placements/gateway.ts')
    expect(pickRoute(t, '/api/placements/abc-123')?.params).toEqual({ id: 'abc-123' })
    expect(pickRoute(t, '/api/placements/line-texts')?.r.pattern).toBe('/api/placements/line-texts')
    expect(pickRoute(t, '/api/nothing/here')).toBeNull()
  })
})
