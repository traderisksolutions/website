/**
 * Chase drafts for overdue follow-ups owed by insurers or clients. Each goes into the Drafts to
 * approve queue (ai_drafts, status pending) on the row's thread when it has one. Nothing sends.
 *
 * RFQ rows are left out: /api/cron/placement-chase already drafts the insurer chase on each
 * dispatch at its chase date, and a second draft here would duplicate it.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { withVoice } from '@/lib/voice'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { isLive } from './rules'
import type { FollowUp } from './types'

export type ChaseResult = { id: string; draft_id?: string; skipped?: string }

/** Why a row cannot be chased, or null. Pure. */
export function chaseBlocker(r: Pick<FollowUp, 'owner_party' | 'status' | 'snoozed_until' | 'source_kind' | 'counterparty_email'>, now: Date): string | null {
  if (!isLive(r, now)) return 'Not open'
  if (r.owner_party !== 'insurer' && r.owner_party !== 'client') return 'Only rows owed by an insurer or a client are chased'
  if (r.source_kind === 'rfq') return 'RFQ chases are drafted by the placement agent'
  if (!r.counterparty_email) return 'No email address on the row'
  return null
}

const parseBody = (t: string | null): string | null => {
  if (!t) return null
  try { const j = JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '')); return typeof j?.body === 'string' && j.body.trim() ? j.body.trim() : null } catch { return null }
}

async function draftOne(r: FollowUp, now: Date): Promise<ChaseResult> {
  const block = chaseBlocker(r, now)
  if (block) return { id: r.id, skipped: block }
  if (r.chase_draft_id) {
    const prior = await sbTry<{ status: string }[]>(`ai_drafts?id=eq.${r.chase_draft_id}&select=status&limit=1`, [])
    if (prior[0]?.status === 'pending') return { id: r.id, skipped: 'A chase is already waiting for approval' }
  }
  const email = r.counterparty_email!.toLowerCase()
  const contact = (await sbTry<{ id: string; first_name: string | null }[]>(`contacts?email=ilike.${enc(email)}&select=id,first_name&limit=1`, []))[0]
  if (!contact) return { id: r.id, skipped: `No contact on file for ${email}` }

  // Claim: only one caller drafts for a given chase count.
  const claimed = await sb<{ id: string }[]>(`follow_ups?id=eq.${r.id}&chase_count=eq.${r.chase_count}`, {
    method: 'PATCH', body: JSON.stringify({ chase_count: r.chase_count + 1, chased_at: now.toISOString() }),
  })
  if (claimed.length === 0) return { id: r.id, skipped: 'Already being chased' }

  const [company, thread] = await Promise.all([
    r.company_id ? sbTry<{ company_name: string }[]>(`companies?id=eq.${r.company_id}&select=company_name&limit=1`, []).then(x => x[0]?.company_name ?? null) : Promise.resolve(null),
    r.thread_id ? sbTry<{ subject: string | null; display_subject: string | null }[]>(`email_threads?id=eq.${r.thread_id}&select=subject,display_subject&limit=1`, []).then(x => x[0] ?? null) : Promise.resolve(null),
  ])
  const who = contact.first_name ?? r.counterparty_name ?? 'them'
  const task = `Write a short, polite follow-up email from a broker at Trade Risk Solutions to ${who}${r.counterparty_name && r.counterparty_name !== who ? ` (${r.counterparty_name})` : ''}${company ? ` about ${company}` : ''}.
Outstanding: ${r.what}. Asked on ${r.since_at.slice(0, 10)}${r.due_at ? `; it was due ${r.due_at.slice(0, 10)}` : ''}. This is follow-up number ${r.chase_count + 1}.
Ask when it can be expected and whether anything is needed from our side. Three sentences at most. Plain text. Greet by first name. No sign-off block.
Return JSON only: { "body": string }`
  const { text, error } = await callGemini({
    agent: 'crm', feature: 'nexus_chase_draft', model: GEMINI_LITE, system: await withVoice(task, 'client'), json: true, temperature: 0.2,
    maxOutputTokens: 1_500, thinkingShare: 0.2, metadata: { follow_up_id: r.id }, parts: [{ text: 'Write it now.' }],
  })
  const body = parseBody(text)
  if (!body) {
    await sbTry(`follow_ups?id=eq.${r.id}`, null, { method: 'PATCH', body: JSON.stringify({ chase_count: r.chase_count, chased_at: r.chased_at }) })
    return { id: r.id, skipped: error ?? 'The model returned no draft' }
  }
  const base = thread?.subject ?? (r.source_kind === 'debit_note' ? `Debit note ${r.source_label ?? ''}`.trim() : r.what)
  const subject = /^re:/i.test(base) ? base : `Re: ${base}`
  const [draft] = await sb<{ id: string }[]>('ai_drafts', {
    method: 'POST',
    body: JSON.stringify({ contact_id: contact.id, thread_id: r.thread_id, channel: 'email', to_email: email, subject, body, status: 'pending',
                           generated_by: 'nexus', email_type: 'FOLLOW_UP_CHASE', cc: [] }),
  })
  if (draft) await sb(`follow_ups?id=eq.${r.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ chase_draft_id: draft.id }) })
  return { id: r.id, draft_id: draft?.id }
}

/** Drafts a chase for each id, one at a time. */
export async function draftChases(ids: string[], now = new Date()): Promise<ChaseResult[]> {
  if (ids.length === 0) return []
  const rows = await sb<FollowUp[]>(`follow_ups?id=in.(${ids.join(',')})&select=*`)
  const byId = new Map(rows.map(r => [r.id, r]))
  const out: ChaseResult[] = []
  for (const id of ids) {
    const r = byId.get(id)
    if (!r) { out.push({ id, skipped: 'Not found' }); continue }
    try { out.push(await draftOne(r, now)) } catch (e) { out.push({ id, skipped: e instanceof Error ? e.message : 'Failed' }) }
  }
  return out
}
