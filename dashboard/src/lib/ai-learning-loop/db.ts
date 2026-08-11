// Narrow persistence port for the learning loop. Deliberately NOT a generic query
// builder — just the handful of operations the stores in this library need — so a test
// can swap in `createInMemoryDB()` instead of hitting Supabase, and the real
// implementation (supabase-db.ts) stays a thin, obviously-correct adapter.
import type { SkillStatus } from './types'

export interface EvalRow {
  id?:              string
  draft_id:         string | null
  thread_id:        string | null
  email_type:       string
  ai_body:           string
  human_body:        string
  score:             number
  substance_score:   number | null
  style_score:       number | null
  edit_type:         string | null
  eval_json:         {
    what_human_changed: string
    why_better:         string
    key_learning:       string
    context_summary:    string
  }
  created_at?:       string
}

export interface ExampleRow {
  id?:              string
  email_type:       string
  context_summary:  string | null
  ideal_reply:      string
  score:            number
  created_at?:      string
}

export interface SkillVersionInsert {
  email_type:         string
  override_text:      string
  source_eval_count:  number
  // Left for the DB backend to stamp if omitted — both the real (Postgres) and in-memory
  // implementations need this in the SAME clock domain as EvalRow.created_at so
  // "evals since this version went live" comparisons are sound; a caller-supplied
  // `new Date()` would race against the in-memory fake DB's own clock in tests.
  synthesized_at?:    string
  status:             SkillStatus
}

export interface SkillVersionRow extends Omit<SkillVersionInsert, 'synthesized_at'> {
  id:             string
  created_at:     string
  synthesized_at: string
}

export interface LearningLoopDB {
  insertEval(row: EvalRow): Promise<void>
  listEvals(opts: { surface?: string; maxScore?: number; since?: string; limit: number }): Promise<EvalRow[]>

  insertExample(row: ExampleRow): Promise<void>
  listExamples(opts: { surface: string; limit: number }): Promise<ExampleRow[]>
  listAllExamples(opts: { limit: number }): Promise<ExampleRow[]>

  insertSkillVersion(row: SkillVersionInsert): Promise<void>
  listSkillVersions(opts: { surface?: string; limit?: number }): Promise<SkillVersionRow[]>
  updateSkillVersionStatus(id: string, status: SkillStatus): Promise<void>
  /** Flip every OTHER 'active' version for this surface to 'superseded'. Used right after
   *  inserting a new active synthesis so exactly one active version exists per surface. */
  supersedeActiveVersions(surface: string, exceptId?: string): Promise<void>
}

// In-memory fake — used by unit tests. Mirrors the ordering/filtering semantics of the real
// Supabase-backed implementation closely enough for the store logic under test to behave the
// same either way.
export function createInMemoryDB(): LearningLoopDB {
  let evalSeq = 0, exampleSeq = 0, versionSeq = 0
  const evals: Required<EvalRow>[] = []
  const examples: Required<ExampleRow>[] = []
  const versions: SkillVersionRow[] = []

  // Monotonic clock (strictly increasing per call) rather than wall-clock `Date.now()` — two
  // inserts issued within the same real millisecond (routine in fast in-memory tests) would
  // otherwise get identical created_at/synthesized_at, breaking strict `>` "since" filters.
  let clockMs = Date.now()
  const nextTimestamp = () => new Date(clockMs += 1).toISOString()

  return {
    async insertEval(row) {
      evals.push({ ...row, id: row.id ?? `eval_${++evalSeq}`, created_at: row.created_at ?? nextTimestamp() })
    },
    async listEvals({ surface, maxScore, since, limit }) {
      return evals
        .filter(e => !surface || e.email_type === surface)
        .filter(e => maxScore === undefined || e.score <= maxScore)
        .filter(e => !since || e.created_at > since)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
    },

    async insertExample(row) {
      examples.push({ ...row, id: row.id ?? `ex_${++exampleSeq}`, created_at: row.created_at ?? nextTimestamp(), context_summary: row.context_summary ?? '' })
    },
    async listExamples({ surface, limit }) {
      return examples
        .filter(e => e.email_type === surface)
        .sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
    },
    async listAllExamples({ limit }) {
      return examples.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
    },

    async insertSkillVersion(row) {
      const ts = nextTimestamp()
      versions.push({ ...row, id: `sv_${++versionSeq}`, created_at: ts, synthesized_at: row.synthesized_at ?? ts })
    },
    async listSkillVersions({ surface, limit }) {
      const filtered = versions
        .filter(v => !surface || v.email_type === surface)
        .sort((a, b) => b.synthesized_at.localeCompare(a.synthesized_at))
      return limit ? filtered.slice(0, limit) : filtered
    },
    async updateSkillVersionStatus(id, status) {
      const v = versions.find(v => v.id === id)
      if (v) v.status = status
    },
    async supersedeActiveVersions(surface, exceptId) {
      for (const v of versions) {
        if (v.email_type === surface && v.status === 'active' && v.id !== exceptId) v.status = 'superseded'
      }
    },
  }
}
