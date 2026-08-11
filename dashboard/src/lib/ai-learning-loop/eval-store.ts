import type { LearningLoopDB } from './db'
import type { EvalInput, EvalRecord, Surface, SurfaceStats } from './types'

function toRecord(row: {
  id?: string; email_type: string; score: number; substance_score: number | null; style_score: number | null
  edit_type: string | null; eval_json: { what_human_changed: string; why_better: string; key_learning: string; context_summary: string }
  created_at?: string; draft_id?: string | null; thread_id?: string | null
}): EvalRecord {
  return {
    id: row.id ?? '',
    surface: row.email_type,
    draftId: row.draft_id ?? null,
    threadId: row.thread_id ?? null,
    score: row.score,
    substanceScore: row.substance_score,
    styleScore: row.style_score,
    editType: row.edit_type,
    keyLearning: row.eval_json?.key_learning ?? '',
    whyBetter: row.eval_json?.why_better ?? '',
    whatChanged: row.eval_json?.what_human_changed ?? '',
    contextSummary: row.eval_json?.context_summary ?? '',
    createdAt: row.created_at ?? '',
  }
}

export class EvalStore {
  constructor(private db: LearningLoopDB) {}

  async record(input: EvalInput): Promise<void> {
    await this.db.insertEval({
      draft_id:   input.draftId ?? null,
      thread_id:  input.threadId ?? null,
      email_type: input.surface,
      ai_body:    input.aiOutput,
      human_body: input.humanOutput,
      score:            input.substance, // legacy column mirrors substance — the axis that matters for thresholds
      substance_score:  input.substance,
      style_score:      input.style,
      edit_type:        input.editType,
      eval_json: {
        what_human_changed: input.whatChanged,
        why_better:         input.whyBetter,
        key_learning:       input.keyLearning,
        context_summary:    input.contextSummary,
      },
    })
  }

  async listRecent(opts: { surface?: Surface; limit?: number } = {}): Promise<EvalRecord[]> {
    const rows = await this.db.listEvals({ surface: opts.surface, limit: opts.limit ?? 100 })
    return rows.map(toRecord)
  }

  /** Substantive-signal evals for a surface (or every surface, if omitted): score <= maxScore
   *  with a real key_learning (style-only edits leave key_learning empty, so they're
   *  naturally excluded). */
  async listLearnings(surface: Surface | undefined, opts: { maxScore?: number; since?: string; limit?: number } = {}): Promise<EvalRecord[]> {
    const rows = await this.db.listEvals({ surface, maxScore: opts.maxScore ?? 4, since: opts.since, limit: opts.limit ?? 100 })
    return rows.map(toRecord).filter(r => r.keyLearning.trim().length >= 10)
  }

  async aggregateBySurface(opts: { limit?: number } = {}): Promise<SurfaceStats[]> {
    const rows = await this.db.listEvals({ limit: opts.limit ?? 100 })
    const byType: Record<Surface, { count: number; total: number }> = {}
    for (const r of rows) {
      const t = r.email_type ?? 'UNKNOWN'
      byType[t] ??= { count: 0, total: 0 }
      byType[t].count++
      byType[t].total += r.score ?? 0
    }
    return Object.entries(byType)
      .map(([surface, d]) => ({ surface, count: d.count, avgScore: d.count ? Math.round((d.total / d.count) * 10) / 10 : 0 }))
      .sort((a, b) => b.count - a.count)
  }
}
