import type { LearningLoopDB } from './db'
import { wordJaccard } from './similarity'
import type { SkillExample, Surface } from './types'

const DEDUP_SIMILARITY_THRESHOLD = 0.85
const DEDUP_WINDOW = 20 // how many recent examples for this surface to check against

function toExample(row: { id?: string; email_type: string; context_summary: string | null; ideal_reply: string; score: number; created_at?: string }): SkillExample {
  return {
    id: row.id ?? '',
    surface: row.email_type,
    contextSummary: row.context_summary ?? '',
    idealOutput: row.ideal_reply,
    score: row.score,
    createdAt: row.created_at ?? '',
  }
}

export class ExampleStore {
  constructor(private db: LearningLoopDB) {}

  /** Store `idealOutput` as a few-shot example for `surface` if it clears the score bar and
   *  isn't near-duplicate of one we already have (keeps the pool diverse rather than repeating
   *  the same template). Returns whether it was actually stored. */
  async promoteIfQualifies(opts: { surface: Surface; idealOutput: string; contextSummary: string; score: number; minScore?: number }): Promise<boolean> {
    const minScore = opts.minScore ?? 4
    if (opts.score < minScore) return false

    const existing = await this.db.listExamples({ surface: opts.surface, limit: DEDUP_WINDOW })
    const isDup = existing.some(e => e.ideal_reply && wordJaccard(e.ideal_reply, opts.idealOutput) > DEDUP_SIMILARITY_THRESHOLD)
    if (isDup) return false

    await this.db.insertExample({
      email_type: opts.surface,
      context_summary: opts.contextSummary,
      ideal_reply: opts.idealOutput,
      score: opts.score,
    })
    return true
  }

  async topForSurface(surface: Surface, limit = 2): Promise<SkillExample[]> {
    const rows = await this.db.listExamples({ surface, limit })
    return rows.map(toExample)
  }

  async listRecent(limit = 50): Promise<SkillExample[]> {
    const rows = await this.db.listAllExamples({ limit })
    return rows.map(toExample)
  }
}
