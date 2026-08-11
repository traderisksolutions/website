import { describe, it, expect } from 'vitest'
import { createInMemoryDB, LearningLoopEngine, type InstructionComposer, type EvalInput } from '@/lib/ai-learning-loop'

function makeEval(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    surface: 'CLAIMS', aiOutput: 'ai body', humanOutput: 'A sufficiently long human-authored reply body.',
    substance: 4, style: 4, editType: 'none',
    whatChanged: '', whyBetter: '', keyLearning: '', contextSummary: 'a claims exchange',
    ...overrides,
  }
}

const composer: InstructionComposer = { compose: async () => 'SYNTHESIZED INSTRUCTIONS' }

describe('LearningLoopEngine.recordAndLearn', () => {
  it('records the eval unconditionally', async () => {
    const db = createInMemoryDB()
    const engine = new LearningLoopEngine(db, composer)
    await engine.recordAndLearn(makeEval())
    expect(await engine.evals.listRecent({ surface: 'CLAIMS' })).toHaveLength(1)
  })

  it('promotes a high-scoring output to a few-shot example', async () => {
    const db = createInMemoryDB()
    const engine = new LearningLoopEngine(db, composer)
    const result = await engine.recordAndLearn(makeEval({ substance: 5 }))
    expect(result.promotedExample).toBe(true)
    expect(await engine.examples.topForSurface('CLAIMS')).toHaveLength(1)
  })

  it('does not promote a low-scoring output', async () => {
    const db = createInMemoryDB()
    const engine = new LearningLoopEngine(db, composer)
    const result = await engine.recordAndLearn(makeEval({ substance: 2, editType: 'substance', keyLearning: 'Ask for the policy number before anything else.' }))
    expect(result.promotedExample).toBe(false)
  })

  it('does not trigger auto-synthesis on a style-only miss even with a learning present', async () => {
    const db = createInMemoryDB()
    const engine = new LearningLoopEngine(db, composer, { autoSynthThreshold: 1 })
    const result = await engine.recordAndLearn(makeEval({ substance: 3, editType: 'style', keyLearning: 'Style-only note that should not count.' }))
    expect(result.autoSynthesisTriggered).toBe(false)
  })

  it('triggers auto-synthesis once a substantive miss with a real learning crosses the threshold', async () => {
    const db = createInMemoryDB()
    const engine = new LearningLoopEngine(db, composer, { autoSynthThreshold: 1 })
    const result = await engine.recordAndLearn(makeEval({ substance: 2, editType: 'substance', keyLearning: 'Always confirm the incident date before drafting a reply.' }))
    expect(result.autoSynthesisTriggered).toBe(true)
    expect((await engine.skills.getEffective('CLAIMS'))?.instructionText).toBe('SYNTHESIZED INSTRUCTIONS')
  })

  it('does not trigger auto-synthesis when the key_learning is too short to count as real signal', async () => {
    const db = createInMemoryDB()
    const engine = new LearningLoopEngine(db, composer, { autoSynthThreshold: 1 })
    const result = await engine.recordAndLearn(makeEval({ substance: 2, editType: 'substance', keyLearning: 'short' }))
    expect(result.autoSynthesisTriggered).toBe(false)
  })
})
