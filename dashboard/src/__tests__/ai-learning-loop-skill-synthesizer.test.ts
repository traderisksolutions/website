import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDB, EvalStore, SkillSynthesizer, type LearningLoopDB, type InstructionComposer, type EvalInput, type LearningSource, type EvalRecord } from '@/lib/ai-learning-loop'

function makeEval(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    surface: 'PRICING', aiOutput: 'ai', humanOutput: 'human',
    substance: 2, style: 2, editType: 'substance',
    whatChanged: 'x', whyBetter: 'y', keyLearning: 'Always quote SGD figures with two decimal places.', contextSummary: 'z',
    ...overrides,
  }
}

function fakeComposer(returnText: string | null = 'REWRITTEN INSTRUCTIONS'): InstructionComposer {
  return { compose: async () => returnText }
}

describe('SkillSynthesizer', () => {
  let db: LearningLoopDB
  let evals: EvalStore

  beforeEach(() => {
    db = createInMemoryDB()
    evals = new EvalStore(db)
  })

  it('refuses to synthesize when there is no learning signal', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer())
    const result = await synth.synthesize('PRICING')
    expect(result).toEqual({ synthesized: false, count: 0, reason: 'no signal' })
  })

  it('synthesizes a new active version from accumulated learnings', async () => {
    await evals.record(makeEval())
    await evals.record(makeEval({ keyLearning: 'Never promise coverage before underwriting confirms it.' }))

    const synth = new SkillSynthesizer(db, fakeComposer('NEW SYNTHESIZED INSTRUCTIONS BLOCK'))
    const result = await synth.synthesize('PRICING')

    expect(result.synthesized).toBe(true)
    expect(result.count).toBe(2)
    const effective = await synth.getEffective('PRICING')
    expect(effective?.instructionText).toBe('NEW SYNTHESIZED INSTRUCTIONS BLOCK')
    expect(effective?.status).toBe('active')
  })

  it('supersedes the previous active version instead of leaving two active', async () => {
    let call = 0
    const composer: InstructionComposer = { compose: async () => `SYNTHESIZED INSTRUCTION VERSION ${++call}` }

    await evals.record(makeEval())
    const synth = new SkillSynthesizer(db, composer)
    await synth.synthesize('PRICING')

    await evals.record(makeEval({ keyLearning: 'A second distinct learning worth capturing here.' }))
    await synth.synthesize('PRICING', { force: true })

    const history = await synth.history('PRICING')
    expect(history.filter(v => v.status === 'active')).toHaveLength(1)
    expect(history.filter(v => v.status === 'superseded')).toHaveLength(1)
    expect((await synth.getEffective('PRICING'))?.instructionText).toBe('SYNTHESIZED INSTRUCTION VERSION 2')
  })

  it('does not resynthesize a pinned surface unless forced', async () => {
    await evals.record(makeEval())
    const synth = new SkillSynthesizer(db, fakeComposer())
    await synth.synthesize('PRICING')
    const [v1] = await synth.history('PRICING')
    await synth.pin(v1.id)

    await evals.record(makeEval({ keyLearning: 'Another substantive learning to try to trigger resynthesis.' }))
    const blocked = await synth.synthesize('PRICING')
    expect(blocked.reason).toContain('pinned')

    const forced = await synth.synthesize('PRICING', { force: true })
    expect(forced.synthesized).toBe(true)
  })

  it('getEffective prefers a pinned version over a newer active one', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer())
    await evals.record(makeEval())
    await synth.synthesize('PRICING')
    const [v1] = await synth.history('PRICING')
    await synth.pin(v1.id)

    expect((await synth.getEffective('PRICING'))?.id).toBe(v1.id)
  })

  it('getEffective ignores deprecated versions', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer())
    await evals.record(makeEval())
    await synth.synthesize('PRICING')
    const [v1] = await synth.history('PRICING')
    await synth.deprecate(v1.id)

    expect(await synth.getEffective('PRICING')).toBeNull()
  })

  it('maybeAutoSynthesize only triggers once enough new learnings accumulate', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer())
    await evals.record(makeEval())
    await evals.record(makeEval({ keyLearning: 'Second learning that is long enough to count.' }))

    const belowThreshold = await synth.maybeAutoSynthesize('PRICING', 3)
    expect(belowThreshold).toBe(false)

    await evals.record(makeEval({ keyLearning: 'Third learning that crosses the threshold now.' }))
    const atThreshold = await synth.maybeAutoSynthesize('PRICING', 3)
    expect(atThreshold).toBe(true)
  })

  it('maybeAutoSynthesize never fires on a pinned surface', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer())
    await evals.record(makeEval())
    await synth.synthesize('PRICING')
    const [v1] = await synth.history('PRICING')
    await synth.pin(v1.id)

    for (let i = 0; i < 5; i++) await evals.record(makeEval({ keyLearning: `Learning number ${i} long enough to count.` }))
    expect(await synth.maybeAutoSynthesize('PRICING', 3)).toBe(false)
  })

  it('unpin restores active status and supersedes any other active version', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer())
    await evals.record(makeEval())
    await synth.synthesize('PRICING')
    const [v1] = await synth.history('PRICING')
    await synth.pin(v1.id)

    await synth.unpin('PRICING', v1.id)
    const effective = await synth.getEffective('PRICING')
    expect(effective?.id).toBe(v1.id)
    expect(effective?.status).toBe('active')
  })

  it('a null composer result is treated as a no-op, not an empty success', async () => {
    await evals.record(makeEval())
    const synth = new SkillSynthesizer(db, fakeComposer(null))
    const result = await synth.synthesize('PRICING')
    expect(result.synthesized).toBe(false)
    expect(await synth.getEffective('PRICING')).toBeNull()
  })
})

function fakeSource(records: EvalRecord[]): LearningSource {
  return { list: async () => records }
}

function makeChatRecord(overrides: Partial<EvalRecord> = {}): EvalRecord {
  return {
    id: 'chat_1', surface: 'PRICING', draftId: null, threadId: null,
    score: 3, substanceScore: 3, styleScore: null, editType: 'substance',
    keyLearning: 'A broker previously had to ask about the deductible — answer: SGD 5,000.',
    whyBetter: '', whatChanged: '', contextSummary: 'From a case chat conversation',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('SkillSynthesizer with additional learning sources', () => {
  let db: LearningLoopDB

  beforeEach(() => { db = createInMemoryDB() })

  it('synthesizes from an additional source alone, with zero eval-store signal', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer('SYNTHESIZED FROM CHAT LEARNINGS ONLY'), {}, [fakeSource([makeChatRecord()])])
    const result = await synth.synthesize('PRICING')
    expect(result.synthesized).toBe(true)
    expect(result.count).toBe(1)
  })

  it('merges eval-store and additional-source learnings into one synthesis call', async () => {
    const evals = new EvalStore(db)
    await evals.record(makeEval())
    const synth = new SkillSynthesizer(db, fakeComposer('MERGED SYNTHESIS RESULT TEXT'), {}, [fakeSource([makeChatRecord(), makeChatRecord({ id: 'chat_2' })])])
    const result = await synth.synthesize('PRICING')
    expect(result.synthesized).toBe(true)
    expect(result.count).toBe(3) // 1 eval-store + 2 chat-sourced
  })

  it('additional-source learnings count toward the auto-synthesize threshold', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer(), {}, [
      fakeSource([makeChatRecord({ id: 'c1' }), makeChatRecord({ id: 'c2' }), makeChatRecord({ id: 'c3' })]),
    ])
    expect(await synth.maybeAutoSynthesize('PRICING', 3)).toBe(true)
  })

  it('still respects no-signal when every source is empty', async () => {
    const synth = new SkillSynthesizer(db, fakeComposer(), {}, [fakeSource([])])
    const result = await synth.synthesize('PRICING')
    expect(result).toEqual({ synthesized: false, count: 0, reason: 'no signal' })
  })
})
