import type { LearningLoopDB } from './db'
import { EvalStore } from './eval-store'
import { ExampleStore } from './example-store'
import { SkillSynthesizer, type InstructionComposer, type LearningSource } from './skill-synthesizer'
import type { EvalInput, Surface } from './types'

export interface LearningLoopResult {
  promotedExample:        boolean
  autoSynthesisTriggered: boolean
}

export interface LearningLoopEngineOptions {
  baseInstructions?:   Partial<Record<Surface, string>>
  exampleMinScore?:    number // score (substance axis) required to promote a few-shot example
  autoSynthThreshold?: number // new substantive learnings required to trigger resynthesis
  additionalLearningSources?: LearningSource[] // e.g. chat-derived learnings pooled across cases
}

// The closed-loop entry point: record an eval, and — the same way Hermes decides after a
// turn "should this become a persisted skill" — decide whether it should also (a) become a
// few-shot example and/or (b) push this surface's instructions past the resynthesis
// threshold. One call from the write path (run-draft-evaluation.ts, the chat-evals cron)
// instead of each call-site re-implementing the "when do we learn" policy.
export class LearningLoopEngine {
  readonly evals:    EvalStore
  readonly examples: ExampleStore
  readonly skills:   SkillSynthesizer

  private exampleMinScore: number
  private autoSynthThreshold: number

  constructor(db: LearningLoopDB, composer: InstructionComposer, opts: LearningLoopEngineOptions = {}) {
    this.evals = new EvalStore(db)
    this.examples = new ExampleStore(db)
    this.skills = new SkillSynthesizer(db, composer, opts.baseInstructions, opts.additionalLearningSources)
    this.exampleMinScore = opts.exampleMinScore ?? 4
    this.autoSynthThreshold = opts.autoSynthThreshold ?? 3
  }

  async recordAndLearn(input: EvalInput): Promise<LearningLoopResult> {
    await this.evals.record(input)

    const promotedExample = await this.examples.promoteIfQualifies({
      surface: input.surface,
      idealOutput: input.humanOutput,
      contextSummary: input.contextSummary,
      score: input.substance,
      minScore: this.exampleMinScore,
    })

    let autoSynthesisTriggered = false
    const hasSubstantiveMiss = (input.editType === 'substance' || input.editType === 'both') && input.keyLearning.trim().length >= 10
    if (hasSubstantiveMiss) {
      autoSynthesisTriggered = await this.skills.maybeAutoSynthesize(input.surface, this.autoSynthThreshold)
    }

    return { promotedExample, autoSynthesisTriggered }
  }
}
