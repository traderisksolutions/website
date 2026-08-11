import { describe, it, expect } from 'vitest'
import { createInMemoryDB, EvalStore, SkillSynthesizer, recommendForSurface, type InstructionComposer, type EvalInput } from '@/lib/ai-learning-loop'

function makeEval(score: number, overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    surface: 'COVERAGE', aiOutput: 'ai', humanOutput: 'human',
    substance: score, style: score, editType: 'none',
    whatChanged: '', whyBetter: '', keyLearning: '', contextSummary: '',
    ...overrides,
  }
}

const composer: InstructionComposer = { compose: async () => 'SYNTHESIZED INSTRUCTIONS BLOCK' }

describe('recommendForSurface', () => {
  it('recommends nothing with too few evals to have a real signal', async () => {
    const db = createInMemoryDB()
    await new EvalStore(db).record(makeEval(5))
    const rec = await recommendForSurface(db, 'COVERAGE')
    expect(rec.action).toBe('none')
    expect(rec.reason).toMatch(/not enough signal/)
  })

  it('recommends pinning a surface with a strong, stable score', async () => {
    const db = createInMemoryDB()
    const evals = new EvalStore(db)
    for (let i = 0; i < 6; i++) await evals.record(makeEval(5))
    const rec = await recommendForSurface(db, 'COVERAGE')
    expect(rec.action).toBe('pin')
  })

  it('recommends deprecating a surface with a weak score', async () => {
    const db = createInMemoryDB()
    const evals = new EvalStore(db)
    for (let i = 0; i < 6; i++) await evals.record(makeEval(2))
    const rec = await recommendForSurface(db, 'COVERAGE')
    expect(rec.action).toBe('deprecate')
  })

  it('says none for a mid-range score', async () => {
    const db = createInMemoryDB()
    const evals = new EvalStore(db)
    for (let i = 0; i < 6; i++) await evals.record(makeEval(4))
    const rec = await recommendForSurface(db, 'COVERAGE')
    expect(rec.action).toBe('none')
  })

  it('only counts evals since the currently-effective version went live', async () => {
    const db = createInMemoryDB()
    const evals = new EvalStore(db)
    // Old, weak evals from before any synthesis existed — should NOT drag down the
    // recommendation once a new version supersedes them.
    for (let i = 0; i < 6; i++) await evals.record(makeEval(2, { editType: 'substance', keyLearning: `Old learning number ${i} worth capturing here.` }))

    const synth = new SkillSynthesizer(db, composer)
    const synthResult = await synth.synthesize('COVERAGE')
    expect(synthResult.synthesized).toBe(true)

    // New evals recorded after the version went live are strong.
    for (let i = 0; i < 6; i++) await evals.record(makeEval(5))

    const rec = await recommendForSurface(db, 'COVERAGE')
    expect(rec.action).toBe('pin')
    expect(rec.sampleSize).toBe(6) // only the post-synthesis evals count
  })

  it('does not recommend pinning a surface that is already pinned', async () => {
    const db = createInMemoryDB()
    const evals = new EvalStore(db)
    await evals.record(makeEval(2, { editType: 'substance', keyLearning: 'A learning worth capturing for this surface.' }))
    const synth = new SkillSynthesizer(db, composer)
    await synth.synthesize('COVERAGE')
    const [v1] = await synth.history('COVERAGE')
    await synth.pin(v1.id)

    for (let i = 0; i < 6; i++) await evals.record(makeEval(5))
    const rec = await recommendForSurface(db, 'COVERAGE')
    expect(rec.action).not.toBe('pin')
  })
})
