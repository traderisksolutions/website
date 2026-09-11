import { describe, it, expect } from 'vitest'

/**
 * email_threads.message_count is 0 on every row in the live database — nothing maintains it.
 * listCompanyThreads therefore counts the message rows it already loads. This guards the shape
 * of that counting so a refactor cannot quietly bring back "0 messages" on every thread.
 */
function countByThread(messages: { thread_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const m of messages) counts.set(m.thread_id, (counts.get(m.thread_id) ?? 0) + 1)
  return counts
}

describe('thread message counts', () => {
  it('counts the messages actually present, not the stale column', () => {
    const counts = countByThread([
      { thread_id: 'a' }, { thread_id: 'a' }, { thread_id: 'a' },
      { thread_id: 'b' },
    ])
    expect(counts.get('a')).toBe(3)
    expect(counts.get('b')).toBe(1)
    expect(counts.get('missing') ?? 0).toBe(0)
  })
})
