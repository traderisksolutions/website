/**
 * Files every email thread under the insurers in it (table thread_insurers) and suggests the
 * policy it is about. Rules first (threads.ts); when the client has several policies with that
 * insurer, the housekeeping agent reads the thread and picks one or none. A broker confirms.
 * Idempotent: one row per thread and insurer; a confirmed row is never overwritten.
 */
import { enc, sb, sbTry } from '@/lib/crm/db'
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { emailDomain, guessPolicy, insurerByDomain, insurerFromSubject, type InsurerRef, type PolicyRef } from './threads'

type Thread = { id: string; subject: string | null; company_id: string | null; last_message_at: string | null }
type Msg = { thread_id: string; from_address: string | null; direction: string; body_text?: string | null; sent_at?: string | null }
type Existing = { thread_id: string; insurer_company_id: string; policy_status: string }

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; ; off += 1000) {
    const r = await sbTry<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${off}`, [])
    out.push(...r)
    if (r.length < 1000) break
  }
  return out
}

/** The agent's pick among the client's policies with this insurer, or null when it cannot tell. */
async function agentPick(thread: Thread, insurer: string, cands: PolicyRef[]): Promise<{ id: string | null; reason: string; confidence: number }> {
  const msgs = await sbTry<{ direction: string; from_address: string | null; sent_at: string | null; body_text: string | null }[]>(
    `email_messages?thread_id=eq.${enc(thread.id)}&deleted_at=is.null&select=direction,from_address,sent_at,body_text&order=sent_at.desc&limit=4`, [])
  const list = cands.map((p, i) => `${i + 1}. ${p.label ?? p.class_of_insurance ?? 'Policy'}${p.policy_number ? ` (no. ${p.policy_number})` : ''}`).join('\n')
  const corpus = `SUBJECT: ${thread.subject ?? ''}\n\n` + msgs.map(m => `--- ${m.direction} ${m.sent_at?.slice(0, 10) ?? ''} ${m.from_address ?? ''}\n${(m.body_text ?? '').slice(0, 3000)}`).join('\n\n')
  const { text } = await callGemini({
    agent: 'housekeeping', feature: 'thread_policy_pick', model: GEMINI_LITE, json: true, temperature: 0, maxOutputTokens: 300,
    system: `An insurance broker's email thread with the insurer ${insurer}. Which ONE of the client's policies below is the thread about? Answer 0 if it is about none of them (a new quote, a claim on another policy, general correspondence) or you cannot tell.\n${list}\nReturn JSON only: { "pick": number, "reason": "under 15 words", "confidence": 0 to 1 }`,
    metadata: { thread_id: thread.id }, parts: [{ text: corpus.slice(0, 14_000) }],
  })
  try {
    const r = JSON.parse((text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '')) as { pick?: number; reason?: string; confidence?: number }
    const i = Number(r.pick)
    const conf = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0
    return { id: i >= 1 && i <= cands.length && conf >= 0.6 ? cands[i - 1].id : null, reason: (r.reason ?? '').slice(0, 200), confidence: conf }
  } catch {
    return { id: null, reason: 'agent gave no answer', confidence: 0 }
  }
}

export type SweepResult = { threads: number; links: number; byRule: number; byAgent: number; open: number }

/** Sweeps threads active since `since` (all when omitted). The agent runs on at most `agentLimit` ambiguous links. */
export async function sweepInsurerThreads(opts: { since?: string; agentLimit?: number; dryRun?: boolean } = {}): Promise<SweepResult & { rows?: unknown[] }> {
  const since = opts.since ? `&last_message_at=gte.${enc(opts.since)}` : ''
  const [insurers, threads, policies, existing] = await Promise.all([
    all<InsurerRef>('companies?kind=eq.insurer&select=id,company_name,domain,domains'),
    all<Thread>(`email_threads?deleted_at=is.null&select=id,subject,company_id,last_message_at${since}`),
    all<PolicyRef>('policies?company_id=not.is.null&select=id,company_id,insurer,policy_number,cover_note_no,class_of_insurance,label'),
    opts.dryRun ? Promise.resolve([] as Existing[]) : all<Existing>('thread_insurers?select=thread_id,insurer_company_id,policy_status'),
  ])
  // Placement request threads: the insurer, the client and the policy are known, not guessed.
  const dispatches = await all<{ thread_id: string; insurer_company_id: string | null; company_id: string; line_id: string }>('placement_dispatches?thread_id=not.is.null&select=thread_id,insurer_company_id,company_id,line_id')
  const lines = dispatches.length ? await all<{ id: string; policy_id: string | null }>('placement_lines?policy_id=not.is.null&select=id,policy_id') : []
  const linePolicy = new Map(lines.map(l => [l.id, l.policy_id]))
  const requestBy = new Map(dispatches.map(d => [d.thread_id, d]))
  const ids = new Set(threads.map(t => t.id))
  const msgs = (await all<Msg>(`email_messages?deleted_at=is.null&direction=eq.inbound&select=thread_id,from_address,direction${since ? `&sent_at=gte.${enc(opts.since!)}` : ''}`)).filter(m => ids.has(m.thread_id))
  const fromBy = new Map<string, string[]>()
  for (const m of msgs) fromBy.set(m.thread_id, [...(fromBy.get(m.thread_id) ?? []), emailDomain(m.from_address)])
  const confirmed = new Set(existing.filter(e => e.policy_status === 'confirmed' || e.policy_status === 'not_a_policy').map(e => `${e.thread_id}|${e.insurer_company_id}`))

  const res: SweepResult = { threads: 0, links: 0, byRule: 0, byAgent: 0, open: 0 }
  const rows: Record<string, unknown>[] = []
  let agentLeft = opts.agentLimit ?? 60
  for (const t of threads) {
    const found = new Map<string, { c: InsurerRef; via: 'sender_domain' | 'subject' }>()
    for (const d of fromBy.get(t.id) ?? []) { const c = insurerByDomain(d, insurers); if (c) found.set(c.id, { c, via: 'sender_domain' }) }
    const s = insurerFromSubject(t.subject, insurers)
    if (s && !found.has(s.id)) found.set(s.id, { c: s, via: 'subject' })
    const request = requestBy.get(t.id)
    const requestInsurer = request?.insurer_company_id ? insurers.find(i => i.id === request.insurer_company_id) : undefined
    if (requestInsurer && !found.has(requestInsurer.id)) found.set(requestInsurer.id, { c: requestInsurer, via: 'subject' })
    if (found.size === 0) continue
    res.threads++
    for (const { c, via } of found.values()) {
      if (confirmed.has(`${t.id}|${c.id}`)) continue
      const known = request && request.insurer_company_id === c.id ? linePolicy.get(request.line_id) ?? null : null
      if (known) {
        res.links++; res.byRule++
        rows.push({ thread_id: t.id, insurer_company_id: c.id, client_company_id: request!.company_id, policy_id: known, via, policy_status: 'confirmed', policy_how: 'placement request thread', confidence: 1, reason: null, last_message_at: t.last_message_at, updated_at: new Date().toISOString() })
        continue
      }
      const g = guessPolicy(t.subject, t.company_id, c.company_name, policies)
      let policyId = g.policy_id, how = g.how, conf: number | null = g.policy_id ? 0.9 : null, reason: string | null = null
      if (!policyId && g.candidates.length > 1 && agentLeft > 0 && !opts.dryRun) {
        agentLeft--
        const a = await agentPick(t, c.company_name, g.candidates)
        if (a.id) { policyId = a.id; how = 'agent'; res.byAgent++ }
        conf = a.confidence; reason = a.reason
      } else if (policyId) res.byRule++
      if (!policyId) res.open++
      res.links++
      rows.push({
        thread_id: t.id, insurer_company_id: c.id, client_company_id: t.company_id, policy_id: policyId, via,
        policy_status: policyId ? 'suggested' : 'none', policy_how: how, confidence: conf, reason, last_message_at: t.last_message_at, updated_at: new Date().toISOString(),
      })
    }
  }
  if (!opts.dryRun) for (let i = 0; i < rows.length; i += 200) {
    await sb('thread_insurers?on_conflict=thread_id,insurer_company_id', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 200)),
    })
  }
  return opts.dryRun ? { ...res, rows } : res
}
