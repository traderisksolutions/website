import { describe, it, expect, vi } from 'vitest'

// A queue of 20 clerk tasks and 2 endorsement tasks, oldest clerk first.
const queue: { id: string; agent: string }[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, agent: 'document_clerk' })),
  { id: 'e0', agent: 'endorsement_main' }, { id: 'e1', agent: 'endorsement_main' },
]
const order: string[] = []
vi.mock('@/lib/agent-tasks/queue', () => ({
  claim: async (agents: string[], limit: number) => {
    const out = queue.filter(t => agents.includes(t.agent)).slice(0, limit)
    for (const t of out) queue.splice(queue.indexOf(t), 1)
    return out.map(t => ({ ...t, attempts: 1, max_attempts: 3, payload: {} }))
  },
  finish: async () => {}, fail: async () => {},
}))

describe('drain', () => {
  it('takes a few tasks from each agent in turn, so a backlog cannot hold the queue', async () => {
    const { drain, register } = await import('@/lib/agent-tasks/runner')
    register('document_clerk' as never, async t => { order.push(t.id) })
    register('endorsement_main' as never, async t => { order.push(t.id) })
    const r = await drain({ agents: ['document_clerk', 'endorsement_main'] as never, budgetMs: 10_000 })
    expect(r.done).toBe(22)
    // Both endorsement tasks run in the first round, not after the 20 clerk tasks.
    expect(order.indexOf('e1')).toBeLessThan(4)
  })
})
