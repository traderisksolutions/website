/** A slow agent holds one worker; the other agents keep working through their queues meanwhile. */
import { describe, it, expect, vi } from 'vitest'

const queues: Record<string, number> = { slow: 1, fast: 6 }
const order: string[] = []
vi.mock('@/lib/agent-tasks/queue', () => ({
  claim: async ([agent]: string[], limit: number) => {
    const n = Math.min(queues[agent] ?? 0, limit); queues[agent] = (queues[agent] ?? 0) - n
    return Array.from({ length: n }, (_, i) => ({ id: `${agent}${i}`, agent }))
  },
  finish: async () => {}, fail: async () => {},
}))
vi.mock('@/lib/agent-tasks/model-guard', () => ({
  modelState: async () => ({ ok: true }), alertHeld: async () => {},
  splitAgents: (agents: string[]) => ({ run: agents, held: [] }),
}))

const { drain, register } = await import('@/lib/agent-tasks/runner')

describe('drain', () => {
  it('finishes the fast agent while the slow one is still running', async () => {
    register('slow' as never, async () => { await new Promise(r => setTimeout(r, 60)); order.push('slow') })
    register('fast' as never, async () => { order.push('fast') })
    const r = await drain({ budgetMs: 5_000 })
    expect(r.done).toBe(7)
    expect(order.indexOf('slow')).toBe(order.length - 1)
  })
})
