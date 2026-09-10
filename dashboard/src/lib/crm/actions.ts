/**
 * Next-action extraction. The agent reads the company's recent threads, payments and quotes
 * and proposes concrete requests with a kind, a priority and a due date where one is implied.
 * Proposals land in company_actions with status "proposed"; staff accept or dismiss them. The
 * agent never marks anything done and never sends anything.
 */
import { sb, sbTry } from './db'
import { geminiJson } from './ai'
import { buildCompanyContext } from './context'
import { ACTION_KINDS } from './types'
import type { Company, CompanyAction, ActionKind, ActionPriority } from './types'

const SYSTEM = `You are the operations assistant at Trade Risk Solutions (TRS), a Singapore insurance broker. From the facts about one client company, list the concrete things a TRS staff member must do next. Only propose actions supported by the facts. Plain, professional English. Dates as YYYY-MM-DD.`

const SCHEMA = `Return a JSON array. Each item:
{
  "title": "short imperative, max 12 words, e.g. 'Reply to Wan Hui about the NDA'",
  "detail": "one or two sentences: what exactly, and why now",
  "kind": "renewal|claim|rfq|payment|general",
  "priority": "high|medium|low",
  "due_date": "YYYY-MM-DD or null",
  "thread_subject": "the exact subject line of the thread this comes from, or null",
  "debit_note_no": "the debit note number if this is a payment action, or null",
  "evidence": "a short quote or fact from the thread or record that justifies this"
}
Rules: at most 8 items. Do not repeat anything already listed under OPEN ACTIONS. An unanswered inbound email is always an action. An overdue debit note is always a payment action. A policy ending within 60 days is a renewal action.`

type Proposal = { title?: unknown; detail?: unknown; kind?: unknown; priority?: unknown; due_date?: unknown; thread_subject?: unknown; debit_note_no?: unknown; evidence?: unknown }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2)
function similar(a: string, b: string): boolean {
  const A = new Set(norm(a)), B = new Set(norm(b))
  if (A.size === 0 || B.size === 0) return false
  let inter = 0
  A.forEach(w => { if (B.has(w)) inter++ })
  return inter / Math.min(A.size, B.size) >= 0.6
}

export async function extractActions(company: Company, createdBy: string | null): Promise<{ created: CompanyAction[]; skipped: number; error?: string }> {
  const ctx = await buildCompanyContext(company, { withExcerpts: true })
  const result = await geminiJson<Proposal[]>({ system: SYSTEM, prompt: `${SCHEMA}\n\nFACTS:\n${ctx.text}`, feature: 'crm_actions', resourceId: company.id, temperature: 0.1 })
  if (!result.data || !Array.isArray(result.data)) return { created: [], skipped: 0, error: result.error ?? 'No actions were proposed.' }

  const existing = await sbTry<CompanyAction[]>(`company_actions?company_id=eq.${company.id}&status=in.(open,proposed)&select=*`, [])
  const kinds = new Set<string>(ACTION_KINDS)
  const threadBySubject = ctx.threads.map(t => ({ id: t.id, subject: (t.subject ?? '').toLowerCase() }))
  const noteByNo = new Map(ctx.payments.map(p => [p.debit_note_no.toUpperCase(), p.id]))

  const rows: Partial<CompanyAction>[] = []
  let skipped = 0
  for (const p of result.data) {
    const title = String(p.title ?? '').trim()
    if (!title) { skipped++; continue }
    if (existing.some(e => similar(e.title, title)) || rows.some(r => similar(r.title!, title))) { skipped++; continue }
    const subj = String(p.thread_subject ?? '').toLowerCase().trim()
    const thread = subj ? threadBySubject.find(t => t.subject === subj) ?? threadBySubject.find(t => t.subject.includes(subj) || subj.includes(t.subject)) : undefined
    const dn = String(p.debit_note_no ?? '').toUpperCase().replace(/\s+/g, '')
    rows.push({
      company_id: company.id, title,
      detail: p.detail ? String(p.detail).trim() : null,
      kind: kinds.has(String(p.kind)) ? String(p.kind) as ActionKind : 'general',
      priority: ['high', 'medium', 'low'].includes(String(p.priority)) ? String(p.priority) as ActionPriority : 'medium',
      due_date: typeof p.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.due_date) ? p.due_date : null,
      thread_id: thread?.id ?? null,
      debit_note_id: dn ? noteByNo.get(dn) ?? null : null,
      source: 'ai', status: 'proposed',
      evidence: p.evidence ? String(p.evidence).slice(0, 600) : null,
      created_by: createdBy,
    })
  }
  if (rows.length === 0) return { created: [], skipped }

  try {
    const created = await sb<CompanyAction[]>('company_actions', { method: 'POST', body: JSON.stringify(rows) })
    return { created, skipped }
  } catch (e) {
    return { created: [], skipped, error: `Could not save the proposals: ${String(e).slice(0, 200)}` }
  }
}
