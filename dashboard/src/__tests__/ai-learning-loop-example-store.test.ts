import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDB, ExampleStore, type LearningLoopDB } from '@/lib/ai-learning-loop'

describe('ExampleStore.promoteIfQualifies', () => {
  let db: LearningLoopDB
  let store: ExampleStore

  beforeEach(() => {
    db = createInMemoryDB()
    store = new ExampleStore(db)
  })

  it('rejects an output scoring below the minimum', async () => {
    const stored = await store.promoteIfQualifies({
      surface: 'CLAIMS', idealOutput: 'We acknowledge your claim and will revert shortly.', contextSummary: 'claim ack', score: 3,
    })
    expect(stored).toBe(false)
    expect(await store.topForSurface('CLAIMS')).toHaveLength(0)
  })

  it('stores a qualifying output', async () => {
    const stored = await store.promoteIfQualifies({
      surface: 'CLAIMS', idealOutput: 'We acknowledge your claim and will revert shortly.', contextSummary: 'claim ack', score: 5,
    })
    expect(stored).toBe(true)
    const examples = await store.topForSurface('CLAIMS')
    expect(examples).toHaveLength(1)
    expect(examples[0].idealOutput).toContain('acknowledge your claim')
  })

  it('rejects a near-duplicate of an existing example (keeps the pool diverse)', async () => {
    await store.promoteIfQualifies({ surface: 'CLAIMS', idealOutput: 'We acknowledge your claim and will revert within 2 business days.', contextSummary: 'a', score: 5 })
    const secondStored = await store.promoteIfQualifies({
      surface: 'CLAIMS', idealOutput: 'we ACKNOWLEDGE your claim and will revert within 2 business days!!', contextSummary: 'b', score: 5,
    })
    expect(secondStored).toBe(false)
    expect(await store.topForSurface('CLAIMS')).toHaveLength(1)
  })

  it('accepts a genuinely different reply for the same surface', async () => {
    await store.promoteIfQualifies({ surface: 'CLAIMS', idealOutput: 'We acknowledge your claim and will revert within 2 business days.', contextSummary: 'a', score: 5 })
    const secondStored = await store.promoteIfQualifies({
      surface: 'CLAIMS', idealOutput: 'Could you confirm the policy number so we can begin processing this claim?', contextSummary: 'b', score: 4,
    })
    expect(secondStored).toBe(true)
    expect(await store.topForSurface('CLAIMS')).toHaveLength(2)
  })

  it('keeps example pools separate per surface', async () => {
    await store.promoteIfQualifies({ surface: 'CLAIMS', idealOutput: 'Claims reply text here that is long enough.', contextSummary: 'a', score: 5 })
    await store.promoteIfQualifies({ surface: 'PRICING', idealOutput: 'Pricing reply text here that is long enough.', contextSummary: 'b', score: 5 })
    expect(await store.topForSurface('CLAIMS')).toHaveLength(1)
    expect(await store.topForSurface('PRICING')).toHaveLength(1)
  })

  it('respects a custom minScore', async () => {
    const stored = await store.promoteIfQualifies({
      surface: 'CLAIMS', idealOutput: 'Decent but not perfect reply.', contextSummary: 'a', score: 3, minScore: 3,
    })
    expect(stored).toBe(true)
  })
})
