/**
 * Read on Today: one model read of a client's row, like a thread summary in Gmail but across every
 * thread on the row (client and insurers, in full) and the client's other recent threads, policies
 * and open placements. It returns a one-line summary, the points that matter, and the next emails;
 * Draft writes the ticked ones as pending drafts. Started by a person's button only; nothing sends.
 *
 * The plan is kept in app_settings under today_read:<row key>. Shaping is shapePlan from the thread
 * bar's reader (src/lib/chief/read.ts), so both readers make the same safe plan.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_DEEP } from '@/lib/gemini-models'
import { sb, sbTry, enc, isInternal } from '@/lib/crm/db'
import { ownWords } from '@/lib/admin/b/relay/intent'
import { parseJsonLoose } from '@/lib/crm/ai'
import { logError } from '@/lib/error-log'
import { routesOnFile, shapePlan, writeStepDraft, type ReadPlan, type ReadStep, type ReadTo } from '@/lib/chief/read'
import { readKey, rowKey } from './desk'
import { rowThreads } from './desk-server'

type Row = Record<string, any>

const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const trim = (s: string | null | undefined, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n)
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const bareName = (a: string | null | undefined) => (String(a ?? '').includes('<') ? String(a).split('<')[0].replace(/"/g, '').trim() : '') || null
const domainOf = (a: string) => a.split('@')[1] ?? ''

const SYSTEM = `You are the chief of staff of a Singapore insurance broker (Trade Risk Solutions, "TRS"). A broker put this client on their list for today. You read every email thread on the list for this client, with the client and with insurers, and the client's other recent threads, policies and open placements. Then you summarise where things stand, the way a good assistant would before the broker replies, and set out the next emails.

Return ONLY JSON:
{
  "summary": "one sentence under 20 words: where this client stands today",
  "points": ["three to five short points, each under 20 words: what each side asked or sent, what is outstanding, any date or deadline. Name the party (client, or the insurer by name)."],
  "steps": [{
    "kind": "email" | "action",
    "party": "client" | "insurer" | "internal",
    "insurer": string | null,
    "product_line": string | null,
    "title": "imperative, under 12 words",
    "detail": "what the email must achieve or what the action is, one or two sentences, with the facts from the threads it must carry"
  }]
}

Rules:
- Facts only from the threads, files and records given. Never invent a premium, date, name or count. If a figure matters and is not given, the step asks for it.
- Bring the parties together: when an insurer needs something only the client has, the client step asks for it; when the client asked something only an insurer can answer, the insurer step asks it.
- One email per recipient: four insurers is four steps.
- party "insurer" steps name the insurer exactly as in the INSURERS ON FILE list and copy its product_line. Prefer insurers already on the threads.
- party "client" steps go to the client's contact on the threads.
- "action" is work for TRS that is not an email.
- Nothing already done. Nothing the other side still owes before TRS can move: say so in the points instead. At most six steps, most pressing first.
- No step for a thank-you or an acknowledgement alone.
- PENDING DRAFTS are emails written but not sent. Never propose a second email to a person who already has one: make it an "action" step "Update the pending email to <name>" that says what to add or change, or "Discard the pending email to <name>" when it is out of date.`

type Ctx = { text: string; client: ReadTo | null; clientThread: string | null; insurerThreads: { id: string; domains: Set<string> }[]; anchor: string; subjectOf: Map<string, string>; pendingTo: Set<string> }

async function context(owner: string, companyId: string | null, threadIds: readonly string[]): Promise<Ctx> {
  const listed = await rowThreads(owner, companyId, threadIds)
  if (!listed.length) throw new Error('This client has no threads on your list.')
  const ids = listed.map(r => r.thread_id as string)
  const sideOf = new Map(listed.map(r => [r.thread_id as string, r.side as string]))
  const [threads, msgs, atts] = await Promise.all([
    sbTry<Row[]>(`email_threads?id=in.${inList(ids)}&select=id,subject,display_subject,last_message_at`, []),
    sbTry<Row[]>(`email_messages?thread_id=in.${inList(ids)}&deleted_at=is.null&select=thread_id,direction,from_address,body_text,sent_at,has_attachments&order=sent_at.desc&limit=200`, []),
    sbTry<Row[]>(`email_attachments?thread_id=in.${inList(ids)}&parsed_text=not.is.null&select=thread_id,filename,parsed_text,created_at&order=created_at.desc&limit=20`, []),
  ])
  const subjectOf = new Map(threads.map(t => [t.id as string, String(t.display_subject || t.subject || '(no subject)')]))
  threads.sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))

  // Each thread in full, newest 20 messages, quoted history removed; files share one budget.
  let fileBudget = 12_000
  const seenFiles = new Set<string>()
  const blocks = threads.map((t, i) => {
    const ms = msgs.filter(m => m.thread_id === t.id).slice(0, 20).reverse()
    const files = atts.filter(a => a.thread_id === t.id && !seenFiles.has(a.filename) && seenFiles.add(a.filename)).map(a => {
      const body = trim(a.parsed_text, Math.min(3_000, Math.max(0, fileBudget))); fileBudget -= body.length
      return body ? `# FILE: ${a.filename}\n${body}` : ''
    }).filter(Boolean)
    return [
      `=== THREAD ${i + 1} (with the ${sideOf.get(t.id) === 'insurer' ? 'insurer' : 'client'}): ${subjectOf.get(t.id)}`,
      ms.map(m => `--- ${String(m.sent_at).slice(0, 16)} ${m.direction} from ${m.from_address}${m.has_attachments ? ' (files attached)' : ''}\n${trim(ownWords(m.body_text), 2_000)}`).join('\n\n'),
      files.join('\n\n'),
    ].filter(Boolean).join('\n\n')
  })

  let company: Row | null = null
  let others: Row[] = [], policies: Row[] = [], placements: Row[] = []
  if (companyId) {
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString()
    const viaInsurers = await sbTry<Row[]>(`thread_insurers?client_company_id=eq.${enc(companyId)}&select=thread_id&limit=20`, [])
    const [c, own, pol, pl] = await Promise.all([
      sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=company_name,kind&limit=1`, []),
      sbTry<Row[]>(`email_threads?company_id=eq.${enc(companyId)}&last_message_at=gte.${enc(since)}&select=id,subject,last_message_at&order=last_message_at.desc&limit=12`, []),
      sbTry<Row[]>(`policies?company_id=eq.${enc(companyId)}&lifecycle=neq.lapsed&select=policy_number,class_of_insurance,insurer,start_date,end_date,lifecycle&order=end_date.desc&limit=15`, []),
      sbTry<Row[]>(`placements?company_id=eq.${enc(companyId)}&status=not.in.(done,dropped,lost,closed)&select=status,placement_lines(label,product_line,status,client_stage,insurer_stage,renewal_date)&limit=5`, []),
    ])
    company = c[0] ?? null; policies = pol; placements = pl
    const otherIds = Array.from(new Set([...own.map(t => t.id as string), ...viaInsurers.map(t => t.thread_id as string)])).filter(id => !ids.includes(id)).slice(0, 10)
    if (otherIds.length) {
      const [ts, last] = await Promise.all([
        sbTry<Row[]>(`email_threads?id=in.${inList(otherIds)}&select=id,subject,last_message_at`, []),
        sbTry<Row[]>(`email_messages?thread_id=in.${inList(otherIds)}&deleted_at=is.null&select=thread_id,from_address,body_text,sent_at&order=sent_at.desc&limit=60`, []),
      ])
      others = ts.map(t => ({ ...t, last: last.find(m => m.thread_id === t.id) }))
    }
  }

  // The client's contact: the latest person outside TRS who wrote on a client thread.
  const clientMsg = msgs.find(m => m.direction === 'inbound' && sideOf.get(m.thread_id) !== 'insurer' && !isInternal(bare(m.from_address)))
  const client: ReadTo | null = clientMsg ? { email: bare(clientMsg.from_address), name: bareName(clientMsg.from_address), contactId: null } : null
  const clientThread = clientMsg?.thread_id ?? listed.find(r => r.side === 'client')?.thread_id ?? null
  const insurerThreads = listed.filter(r => r.side === 'insurer').map(r => ({
    id: r.thread_id as string,
    domains: new Set(msgs.filter(m => m.thread_id === r.thread_id && !isInternal(bare(m.from_address))).map(m => domainOf(bare(m.from_address))).filter(Boolean)),
  }))

  const pending = await sbTry<Row[]>(`ai_drafts?or=(thread_id.in.${inList(ids)},context_used->>thread_id.in.${inList(ids)})&status=in.(pending,draft)&deleted_at=is.null&select=to_email,subject,body,created_at&order=created_at.asc&limit=20`, [])

  const routes = await routesOnFile()
  const insurersList = Array.from(new Set(routes.map(r => `${r.insurer} — ${r.productLine}`))).sort()
  const text = [
    `CLIENT: ${company?.company_name ?? 'not filed'}`,
    policies.length ? `POLICIES ON FILE:\n${policies.map(p => `- ${p.class_of_insurance ?? ''} · ${p.insurer ?? ''} · ${p.policy_number ?? ''} · ${p.start_date ?? '?'} to ${p.end_date ?? '?'} · ${p.lifecycle ?? ''}`).join('\n')}` : 'POLICIES ON FILE: none',
    placements.length ? `OPEN PLACEMENTS:\n${placements.flatMap(p => (p.placement_lines ?? []).map((l: Row) => `- ${l.label ?? l.product_line} · client side ${l.client_stage ?? 'not set'} · insurer side ${l.insurer_stage ?? 'not set'}${l.renewal_date ? ` · renews ${l.renewal_date}` : ''}`)).join('\n')}` : 'OPEN PLACEMENTS: none',
    `INSURERS ON FILE (name — product_line):\n${insurersList.join('\n')}`,
    blocks.join('\n\n'),
    pending.length ? `PENDING DRAFTS (written, not sent):\n${pending.map(p => `- to ${p.to_email} · written ${String(p.created_at).slice(0, 10)} · ${p.subject ?? ''}\n${trim(p.body, 600)}`).join('\n')}` : 'PENDING DRAFTS: none',
    others.length ? `THE CLIENT'S OTHER RECENT THREADS (latest message only):\n${others.map(o => `- ${o.subject ?? ''} · ${String(o.last?.sent_at ?? o.last_message_at ?? '').slice(0, 10)} · ${o.last?.from_address ?? ''}: ${trim(ownWords(o.last?.body_text), 400)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  const pendingTo = new Set(pending.flatMap(p => String(p.to_email ?? '').split(/[,;]\s*/)).map(a => bare(a)).filter(Boolean))
  return { text, client, clientThread, insurerThreads, anchor: clientThread ?? ids[0], subjectOf, pendingTo }
}

const keyOf = (owner: string, companyId: string | null, threadIds: readonly string[]) => readKey(rowKey(owner, companyId, threadIds[0] ?? ''))

async function load(key: string): Promise<ReadPlan | null> {
  const [r] = await sbTry<Row[]>(`app_settings?key=eq.${enc(key)}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) as ReadPlan } catch { return null }
}
async function save(key: string, plan: ReadPlan): Promise<void> {
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key, value: JSON.stringify(plan), updated_at: new Date().toISOString() }) })
}

/** Pure. The model's points made safe: strings only, at most five, each one line. */
export function normalisePoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(p => String(p ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5).map(p => p.slice(0, 220))
}

/**
 * Pure. One person, one email: a suggested email to someone who already has an unsent draft becomes
 * an action to fold it into that draft, whatever the model proposed.
 */
export function oneEmailPerPerson(steps: ReadStep[], pendingTo: ReadonlySet<string>): ReadStep[] {
  return steps.map(s => {
    const to = s.to?.email.toLowerCase()
    if (s.kind !== 'email' || !to || !pendingTo.has(to)) return s
    return { ...s, kind: 'action', title: `Add to the pending email to ${s.to?.name ?? to}`.slice(0, 140), detail: `${s.title}. ${s.detail}`.slice(0, 600), to: null }
  })
}

/** One model read of the row. The points ride in the plan's situation, one per line. */
export async function readRow(owner: string, companyId: string | null, threadIds: readonly string[], actor: string): Promise<ReadPlan> {
  const ctx = await context(owner, companyId, threadIds)
  const r = await callGemini({ agent: 'crm', feature: 'today_read', model: GEMINI_DEEP, system: SYSTEM, parts: [{ text: ctx.text }], json: true, maxOutputTokens: 6_000, thinkingShare: 0.3, temperature: 0.2, metadata: { company_id: companyId, by: actor, threads: threadIds.length } })
  if (!r.text) throw new Error(r.error ?? 'The model returned nothing.')
  const raw = parseJsonLoose<{ summary?: string; points?: unknown; steps?: unknown[] }>(r.text)
  if (!raw) {
    void logError({ source: 'gemini', feature: 'today_read', message: `Unreadable output (${r.text.length} chars): ${r.text.slice(0, 400)} … ${r.text.slice(-300)}` })
    throw new Error('The model’s answer was not readable. Press Read again.')
  }
  const plan = shapePlan({ summary: raw.summary, situation: normalisePoints(raw.points).join('\n'), steps: (raw.steps ?? []) as never }, await routesOnFile(), ctx.client, actor, GEMINI_DEEP)
  plan.steps = oneEmailPerPerson(plan.steps, ctx.pendingTo).slice(0, 6)
  await save(keyOf(owner, companyId, threadIds), plan)
  return plan
}

/** Writes each ticked email as a pending draft on the row: client replies on the client thread, insurer emails on that insurer's thread when there is one. */
export async function draftRow(owner: string, companyId: string | null, threadIds: readonly string[], stepIds: readonly string[], actor: string): Promise<ReadPlan> {
  const key = keyOf(owner, companyId, threadIds)
  const plan = await load(key)
  if (!plan) throw new Error('Read this client first.')
  const ctx = await context(owner, companyId, threadIds)
  const picked = new Set(stepIds)
  for (const step of plan.steps) {
    if (!picked.has(step.id) || step.status !== 'proposed') continue
    if (step.kind === 'action') { step.status = 'todo'; continue }
    if (!step.to) continue
    const toDomain = domainOf(step.to.email)
    const reply = step.party === 'client' ? ctx.clientThread : ctx.insurerThreads.find(t => t.domains.has(toDomain))?.id ?? null
    step.draftId = await writeStepDraft(step, {
      text: ctx.text, subject: reply ? ctx.subjectOf.get(reply) ?? null : null, replyThreadId: reply, feature: 'today_read_draft',
      context: { agent: 'today', kind: 'read_step', title: step.title, step: step.id, thread_id: reply ?? ctx.anchor, company_id: companyId, insurer: step.insurer, by: actor },
    })
    step.status = 'drafted'
  }
  await save(key, plan)
  return plan
}
