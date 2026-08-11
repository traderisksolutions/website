import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDB, EvalStore, type LearningLoopDB, type EvalInput } from '@/lib/ai-learning-loop'

function makeEval(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    surface: 'PRICING', aiOutput: 'ai body', humanOutput: 'human body',
    substance: 4, style: 4, editType: 'none',
    whatChanged: '', whyBetter: '', keyLearning: '', contextSummary: '',
    ...overrides,
  }
}

describe('EvalStore', () => {
  let db: LearningLoopDB
  let store: EvalStore

  beforeEach(() => {
    db = createInMemoryDB()
    store = new EvalStore(db)
  })

  it('records an eval with the legacy score column mirroring substance', async () => {
    await store.record(makeEval({ substance: 3, style: 5 }))
    const [rec] = await store.listRecent({ surface: 'PRICING' })
    expect(rec.score).toBe(3)
    expect(rec.substanceScore).toBe(3)
    expect(rec.styleScore).toBe(5)
  })

  it('aggregates avg score and count per surface', async () => {
    await store.record(makeEval({ surface: 'PRICING', substance: 4 }))
    await store.record(makeEval({ surface: 'PRICING', substance: 2 }))
    await store.record(makeEval({ surface: 'CLAIMS', substance: 5 }))

    const stats = await store.aggregateBySurface()
    const pricing = stats.find(s => s.surface === 'PRICING')
    const claims = stats.find(s => s.surface === 'CLAIMS')
    expect(pricing).toEqual({ surface: 'PRICING', count: 2, avgScore: 3 })
    expect(claims).toEqual({ surface: 'CLAIMS', count: 1, avgScore: 5 })
  })

  it('listLearnings excludes evals without a real key_learning', async () => {
    await store.record(makeEval({ substance: 2, keyLearning: '' })) // style-only edit, no learning
    await store.record(makeEval({ substance: 2, keyLearning: 'short' })) // too short (<10 chars)
    await store.record(makeEval({ substance: 2, keyLearning: 'Always confirm the sum insured before quoting.' }))

    const learnings = await store.listLearnings('PRICING')
    expect(learnings).toHaveLength(1)
    expect(learnings[0].keyLearning).toContain('sum insured')
  })

  it('listLearnings respects the maxScore filter', async () => {
    await store.record(makeEval({ substance: 5, keyLearning: 'A learning nobody needs because it scored well.' }))
    const learnings = await store.listLearnings('PRICING', { maxScore: 4 })
    expect(learnings).toHaveLength(0)
  })

  it('listLearnings can scope to evals created after a given timestamp', async () => {
    await store.record(makeEval({ substance: 2, keyLearning: 'Old learning worth remembering here.' }))
    const cutoff = new Date(Date.now() + 1000).toISOString()
    await store.record(makeEval({ substance: 2, keyLearning: 'New learning worth remembering here.' }))

    const sinceCutoff = await store.listLearnings('PRICING', { since: cutoff })
    expect(sinceCutoff.map(l => l.keyLearning)).not.toContain('Old learning worth remembering here.')
  })

  it('listLearnings across all surfaces when surface is omitted', async () => {
    await store.record(makeEval({ surface: 'PRICING', substance: 2, keyLearning: 'Pricing learning goes here for the test.' }))
    await store.record(makeEval({ surface: 'CLAIMS', substance: 2, keyLearning: 'Claims learning goes here for the test.' }))
    const all = await store.listLearnings(undefined)
    expect(all.map(l => l.surface).sort()).toEqual(['CLAIMS', 'PRICING'])
  })
})
