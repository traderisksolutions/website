/**
 * The company brief: a saved, timestamped summary of where the relationship stands. Gemini
 * Flash by default; Opus when the caller asks for a deep analysis. The result is stored on the
 * company row so the page opens instantly and the timestamp shows how fresh it is.
 */
import { sbTry } from './db'
import { geminiJson, opusJson } from './ai'
import { buildCompanyContext } from './context'
import { isStage } from './stage'
import { STAGE_LABEL, ACTION_KINDS } from './types'
import type { AiBrief, Company, ActionKind } from './types'

const SYSTEM = `You are the account analyst at Trade Risk Solutions (TRS), an insurance broker in Singapore. You write short, factual briefs for colleagues about one client company, using only the facts provided. Plain, professional English. No speculation presented as fact. Dates as YYYY-MM-DD. Amounts with currency.`

const SCHEMA = `Return one JSON object with exactly these keys:
{
  "summary": "3 to 5 sentences: who they are to TRS, what is going on right now, what matters most this week.",
  "relationship": "One sentence on the state of the relationship and who the main contact is.",
  "open_items": [ { "title": "short imperative", "detail": "one sentence with the evidence", "kind": "renewal|claim|rfq|payment|general", "due": "YYYY-MM-DD or null" } ],
  "risks": [ "one sentence each — overdue money, unanswered emails, approaching expiry, unhappy tone" ],
  "upcoming": [ { "what": "renewal / due date / follow-up", "when": "YYYY-MM-DD or null" } ],
  "suggested_stage": "lead|prospect|quoting|client|renewal_due|lapsed or null if the current stage is right",
  "sources": [ "subject lines or debit note numbers you relied on" ]
}
Keep open_items to the 3 to 7 that matter. Keep risks to at most 5.`

function coerce(raw: Partial<AiBrief> & Record<string, unknown>, model: string, deep: boolean): AiBrief {
  const kinds = new Set<string>(ACTION_KINDS)
  const items = Array.isArray(raw.open_items) ? raw.open_items : []
  return {
    summary:      String(raw.summary ?? '').trim(),
    relationship: String(raw.relationship ?? '').trim(),
    open_items:   items.filter(i => i && typeof i === 'object' && (i as { title?: unknown }).title).slice(0, 8).map(i => {
      const it = i as { title: unknown; detail?: unknown; kind?: unknown; due?: unknown }
      return {
        title:  String(it.title).trim(),
        detail: it.detail ? String(it.detail).trim() : undefined,
        kind:   kinds.has(String(it.kind)) ? String(it.kind) as ActionKind : 'general',
        due:    typeof it.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.due) ? it.due : null,
      }
    }),
    risks:    (Array.isArray(raw.risks) ? raw.risks : []).map(String).filter(Boolean).slice(0, 6),
    upcoming: (Array.isArray(raw.upcoming) ? raw.upcoming : []).filter(u => u && typeof u === 'object').slice(0, 8).map(u => {
      const up = u as { what?: unknown; when?: unknown }
      return { what: String(up.what ?? '').trim(), when: typeof up.when === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(up.when) ? up.when : null }
    }).filter(u => u.what),
    suggested_stage: isStage(raw.suggested_stage) ? raw.suggested_stage : null,
    sources:  (Array.isArray(raw.sources) ? raw.sources : []).map(String).filter(Boolean).slice(0, 12),
    generated_at: new Date().toISOString(),
    model, deep,
  }
}

export async function generateBrief(company: Company, opts: { deep?: boolean } = {}): Promise<{ brief: AiBrief | null; error?: string }> {
  const ctx = await buildCompanyContext(company, { withExcerpts: true })
  const prompt = `${SCHEMA}\n\nCurrent stage set by staff: ${STAGE_LABEL[company.stage]}.\n\nFACTS:\n${ctx.text}`

  const result = opts.deep
    ? await opusJson<Partial<AiBrief>>({ system: SYSTEM, prompt, feature: 'crm_brief', resourceId: company.id, maxTokens: 5000 })
    : await geminiJson<Partial<AiBrief>>({ system: SYSTEM, prompt, feature: 'crm_brief', resourceId: company.id, temperature: 0.2 })

  if (!result.data) return { brief: null, error: result.error ?? 'No brief was produced.' }
  const brief = coerce(result.data as Partial<AiBrief> & Record<string, unknown>, result.model, !!opts.deep)
  if (!brief.summary) return { brief: null, error: 'The brief came back empty.' }

  // Best effort: the ai_brief columns arrive with 20260910_companies_crm.sql. Until then the
  // brief is still returned to the page, just not remembered between visits.
  await sbTry(`companies?id=eq.${company.id}`, null, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ai_brief: brief, ai_brief_at: brief.generated_at, ai_brief_model: brief.model }),
  })
  return { brief }
}
