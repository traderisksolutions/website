// Real LearningLoopDB backed by Supabase's PostgREST endpoint — same SB_URL / service-key
// header pattern already used throughout src/lib and src/app/api, just centralised here so
// it's exercised through one adapter instead of being copy-pasted per call-site.
import { SB_URL, sbHeaders } from '@/lib/sb'
import type { LearningLoopDB, EvalRow, ExampleRow, SkillVersionInsert, SkillVersionRow } from './db'
import type { SkillStatus } from './types'

async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders(), cache: 'no-store' })
  const data = res.ok ? await res.json() : []
  return Array.isArray(data) ? data : []
}

async function post(path: string, body: unknown, prefer = 'return=minimal'): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'POST', headers: sbHeaders(prefer), body: JSON.stringify(body) })
}

async function patch(path: string, body: unknown): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(body) })
}

export function createSupabaseDB(): LearningLoopDB {
  return {
    async insertEval(row: EvalRow) {
      await post('draft_evaluations', row)
    },
    async listEvals({ surface, maxScore, since, limit }) {
      const params = new URLSearchParams()
      if (surface) params.set('email_type', `eq.${surface}`)
      if (maxScore !== undefined) params.set('score', `lte.${maxScore}`)
      if (since) params.set('created_at', `gt.${since}`)
      params.set('order', 'created_at.desc')
      params.set('limit', String(limit))
      params.set('select', 'id,draft_id,thread_id,email_type,score,substance_score,style_score,edit_type,eval_json,created_at')
      return get<EvalRow>(`draft_evaluations?${params.toString()}`)
    },

    async insertExample(row: ExampleRow) {
      await post('prompt_examples', row)
    },
    async listExamples({ surface, limit }) {
      const params = new URLSearchParams({
        email_type: `eq.${surface}`,
        order:      'score.desc,created_at.desc',
        limit:      String(limit),
        select:     'id,email_type,context_summary,ideal_reply,score,created_at',
      })
      return get<ExampleRow>(`prompt_examples?${params.toString()}`)
    },
    async listAllExamples({ limit }) {
      const params = new URLSearchParams({ order: 'created_at.desc', limit: String(limit), select: 'id,email_type,context_summary,ideal_reply,score,created_at' })
      return get<ExampleRow>(`prompt_examples?${params.toString()}`)
    },

    async insertSkillVersion(row: SkillVersionInsert) {
      // Stamp synthesized_at explicitly rather than relying on a DB default — newest-wins
      // ordering and the auto-synthesis throttle window both depend on it being present.
      await post('prompt_overrides', { ...row, synthesized_at: row.synthesized_at ?? new Date().toISOString() })
    },
    async listSkillVersions({ surface, limit }) {
      const params = new URLSearchParams()
      if (surface) params.set('email_type', `eq.${surface}`)
      params.set('order', 'synthesized_at.desc')
      if (limit) params.set('limit', String(limit))
      params.set('select', 'id,email_type,override_text,source_eval_count,synthesized_at,status,created_at')
      return get<SkillVersionRow>(`prompt_overrides?${params.toString()}`)
    },
    async updateSkillVersionStatus(id: string, status: SkillStatus) {
      await patch(`prompt_overrides?id=eq.${id}`, { status })
    },
    async supersedeActiveVersions(surface: string, exceptId?: string) {
      const params = new URLSearchParams({ email_type: `eq.${surface}`, status: 'eq.active' })
      if (exceptId) params.set('id', `neq.${exceptId}`)
      await patch(`prompt_overrides?${params.toString()}`, { status: 'superseded' })
    },
  }
}
