import type { LearningLoopDB, SkillVersionRow } from './db'
import { EvalStore } from './eval-store'
import type { EvalRecord, Surface, SkillVersion } from './types'

export interface InstructionComposer {
  /** Rewrite `baseInstruction` for `surface` given accumulated learnings. Return null/empty
   *  to signal "couldn't produce a usable rewrite" (e.g. provider error) — the synthesizer
   *  treats that as a no-op, never as ok-but-empty. */
  compose(opts: { surface: Surface; baseInstruction: string; learnings: EvalRecord[] }): Promise<string | null>
}

/** A supplementary source of learnings beyond eval-derived ones — e.g. facts extracted
 *  from chat conversations, pooled across cases and tagged by surface. Shares the
 *  EvalRecord shape so the composer doesn't need to know where a learning came from. */
export interface LearningSource {
  list(surface: Surface, opts: { since?: string }): Promise<EvalRecord[]>
}

export interface SynthesisResult {
  synthesized: boolean
  count:       number
  text?:       string
  reason?:     string
}

function toVersion(row: SkillVersionRow): SkillVersion {
  return {
    id: row.id,
    surface: row.email_type,
    instructionText: row.override_text,
    sourceEvalCount: row.source_eval_count,
    status: row.status,
    synthesizedAt: row.synthesized_at,
    createdAt: row.created_at,
  }
}

const DEFAULT_BASE_INSTRUCTION = (surface: Surface) =>
  `General guidance for ${surface}: be accurate, concise and professional; follow house style; never invent facts.`

export class SkillSynthesizer {
  private evalStore: EvalStore

  constructor(
    private db: LearningLoopDB,
    private composer: InstructionComposer,
    private baseInstructions: Partial<Record<Surface, string>> = {},
    private additionalSources: LearningSource[] = [],
  ) {
    this.evalStore = new EvalStore(db)
  }

  private async collectLearnings(surface: Surface, opts: { since?: string }): Promise<EvalRecord[]> {
    const fromEvals = await this.evalStore.listLearnings(surface, { since: opts.since })
    const fromOthers = await Promise.all(this.additionalSources.map(s => s.list(surface, opts)))
    return [...fromEvals, ...fromOthers.flat()]
  }

  /** Every version currently in effect (all surfaces), i.e. the pinned one if present,
   *  else the newest active one. This is what drafting code should inject. */
  async getEffective(surface: Surface): Promise<SkillVersion | null> {
    const versions = await this.db.listSkillVersions({ surface, limit: 20 })
    const pinned = versions.find(v => v.status === 'pinned')
    if (pinned) return toVersion(pinned)
    const active = versions.find(v => v.status === 'active')
    return active ? toVersion(active) : null
  }

  /** Full version history for a surface (or every surface if omitted), newest first —
   *  the "skill evolution over time" view. */
  async history(surface?: Surface): Promise<SkillVersion[]> {
    const rows = await this.db.listSkillVersions({ surface })
    return rows.map(toVersion)
  }

  async pin(id: string): Promise<void> { await this.db.updateSkillVersionStatus(id, 'pinned') }
  async deprecate(id: string): Promise<void> { await this.db.updateSkillVersionStatus(id, 'deprecated') }
  async unpin(surface: Surface, id: string): Promise<void> {
    await this.db.supersedeActiveVersions(surface)
    await this.db.updateSkillVersionStatus(id, 'active')
  }

  /** Rewrite the instruction block for one surface from accumulated substantive learnings.
   *  Refuses on a pinned surface unless `force` — pinning is an explicit "don't touch this". */
  async synthesize(surface: Surface, opts: { since?: string; force?: boolean } = {}): Promise<SynthesisResult> {
    const current = await this.getEffective(surface)
    if (current?.status === 'pinned' && !opts.force) {
      return { synthesized: false, count: 0, reason: 'surface is pinned — resynthesis skipped' }
    }

    const learnings = await this.collectLearnings(surface, { since: opts.since })
    if (learnings.length === 0) return { synthesized: false, count: 0, reason: 'no signal' }

    const baseInstruction = this.baseInstructions[surface] ?? DEFAULT_BASE_INSTRUCTION(surface)
    const text = await this.composer.compose({ surface, baseInstruction, learnings })
    if (!text || text.trim().length < 20) return { synthesized: false, count: learnings.length, reason: 'composer returned no usable text' }

    // Demote the currently-active version(s) before inserting the new one so exactly one
    // active version exists per surface at any time (pinned versions are left untouched).
    await this.db.supersedeActiveVersions(surface)
    await this.db.insertSkillVersion({
      email_type: surface,
      override_text: text,
      source_eval_count: learnings.length,
      status: 'active',
    })
    return { synthesized: true, count: learnings.length, text }
  }

  /** Fully-automatic trigger: after enough NEW substantive misses since the surface's last
   *  version, resynthesise it. Self-throttling — a fresh version resets the "since" window. */
  async maybeAutoSynthesize(surface: Surface, threshold: number): Promise<boolean> {
    const versions = await this.db.listSkillVersions({ surface, limit: 1 })
    const last = versions[0]
    if (last?.status === 'pinned') return false
    const newLearnings = await this.collectLearnings(surface, { since: last?.synthesized_at })
    if (newLearnings.length < threshold) return false
    const result = await this.synthesize(surface, { since: last?.synthesized_at })
    return result.synthesized
  }
}
