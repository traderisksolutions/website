/**
 * Structured facts/Q&A extracted from a case's Ask-Opus chat conversations (see
 * src/app/api/cron/nexus-chat-learnings/route.ts for the nightly extraction job).
 *
 * Two consumers, deliberately different in scope:
 *  - `caseChatContext(caseId)` — case-scoped, read by that SAME case's next Grand Analysis
 *    (src/lib/run-nexus-analysis.ts Phase 1/2/3) so the broker isn't asked to repeat
 *    context they already gave the chatbot.
 *  - `createEngagementChatLearningSource()` — pooled across ALL cases, grouped by
 *    `email_type`, plugged into SkillSynthesizer as a second learning source alongside
 *    draft_evaluations, so recurring chat topics improve Engagement's general drafting
 *    instructions for everyone.
 * Nothing here triggers a re-analysis — rows just sit until the next natural read.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'
import { wordJaccard, type EvalRecord, type LearningSource, type Surface } from '@/lib/ai-learning-loop'

export type ChatLearningRow = {
  id:         string
  case_id:    string
  email_type: string | null
  question:   string
  answer:     string
  created_at: string
}

export type ChatLearningItem = { email_type: string | null; question: string; answer: string }

export async function listChatLearningsForCase(caseId: string): Promise<ChatLearningRow[]> {
  const res = await fetch(
    `${SB_URL}/rest/v1/nexus_chat_learnings?case_id=eq.${caseId}&order=created_at.asc&select=*`,
    { headers: sbHeaders() }
  )
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) ? rows : []
}

const DEDUP_SIMILARITY_THRESHOLD = 0.85

// Insert newly-extracted items for a case, skipping any that are near-duplicates of what's
// already stored (overlapping nightly extraction windows would otherwise pile up repeats).
// Returns how many were actually inserted.
export async function recordChatLearnings(caseId: string, items: ChatLearningItem[]): Promise<number> {
  const usable = items.filter(i => i.question.trim().length >= 5 && i.answer.trim().length >= 5)
  if (usable.length === 0) return 0

  const existing = await listChatLearningsForCase(caseId)
  const fresh = usable.filter(item =>
    !existing.some(e => wordJaccard(e.question, item.question) > DEDUP_SIMILARITY_THRESHOLD)
  )
  if (fresh.length === 0) return 0

  await fetch(`${SB_URL}/rest/v1/nexus_chat_learnings`, {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify(fresh.map(i => ({
      case_id: caseId, email_type: i.email_type, question: i.question, answer: i.answer,
    }))),
  })
  return fresh.length
}

// Plain-text block for injecting into a Grand Analysis prompt for THIS case only.
export async function caseChatContext(caseId: string): Promise<string> {
  const rows = await listChatLearningsForCase(caseId)
  if (rows.length === 0) return ''
  return rows.map(r => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n')
}

function toEvalRecord(row: ChatLearningRow): EvalRecord {
  return {
    id: row.id,
    surface: row.email_type ?? 'general',
    draftId: null,
    threadId: null,
    score: 3, substanceScore: 3, styleScore: null,
    editType: 'substance',
    keyLearning: `A broker previously had to ask the AI consultant: "${row.question}" — answer: ${row.answer}. Address this proactively instead of requiring the same question again.`,
    whyBetter: '',
    whatChanged: '',
    contextSummary: 'Extracted from a Nexus case chat conversation',
    createdAt: row.created_at,
  }
}

export function createEngagementChatLearningSource(): LearningSource {
  return {
    async list(surface: Surface, opts: { since?: string }): Promise<EvalRecord[]> {
      const params = new URLSearchParams({ email_type: `eq.${surface}`, order: 'created_at.desc', select: '*' })
      if (opts.since) params.set('created_at', `gt.${opts.since}`)
      const res = await fetch(`${SB_URL}/rest/v1/nexus_chat_learnings?${params.toString()}`, { headers: sbHeaders() })
      const rows: ChatLearningRow[] = res.ok ? await res.json() : []
      return (Array.isArray(rows) ? rows : []).map(toEvalRecord)
    },
  }
}
