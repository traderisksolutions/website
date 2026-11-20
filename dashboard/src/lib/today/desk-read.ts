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
import { rewriteDraft } from './ask'
import { personName, plain, pointLine, stepTitle, type PointParts } from './read-words'
import { rowThreads } from './desk-server'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { checkFacts, condenseKey, threadState, type Condensed } from './condense'

type Row = Record<string, any>

const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const trim = (s: string | null | undefined, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n)
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const bareName = (a: string | null | undefined) => (String(a ?? '').includes('<') ? String(a).split('<')[0].replace(/"/g, '').trim() : '') || null
const domainOf = (a: string) => a.split('@')[1] ?? ''

/** The labelled facts both the Read and Condense return (condense.ts checks every date and figure). */
const FACTS_SPEC = `{
    "client_asked": [{ "date": "YYYY-MM-DD the client asked", "what": "what they asked for, under 15 words" }],
    "trs_promised": [{ "date": "YYYY-MM-DD TRS promised it, or null", "what": "what TRS said it would do, under 15 words" }],
    "owed": [{ "party": "client, or the insurer by name, or TRS", "what": "what that party still owes, under 15 words", "since": "YYYY-MM-DD it was asked for, or null" }],
    "next": [{ "what": "the next step, under 12 words", "by": "YYYY-MM-DD it is due, or null" }]
  }`
const FACTS_RULES = `Facts: no sentences of explanation, only the short phrase. Every date as YYYY-MM-DD and only a date written in the threads or records; every figure exactly as written there. Nothing guessed: leave a list empty rather than guess. At most four per list, newest first.`

const SYSTEM = `You are the assistant of a Singapore insurance broker (Trade Risk Solutions, "TRS"). A broker put this client on Today. Read every thread on the list (with the client and with insurers), the client's other recent threads, policies and open placements. Say where things stand and what TRS does next.

Return ONLY JSON:
{
  "summary": "where this stands, under 15 words, a plain sentence",
  "points": [{ "side": "client" | "insurer", "who": "the person, or the insurer by name", "text": "what they asked, sent or decided, under 12 words", "date": "19 Nov" | null }],
  "steps": [{
    "kind": "email" | "action",
    "party": "client" | "insurer" | "internal",
    "insurer": string | null,
    "product_line": string | null,
    "verb": "send" | "quote" | "chase" | "ask" | "confirm" | "update" | "discard" | "task",
    "who": "the person's name (never an email address)" | null,
    "what": "the document or thing, e.g. the revised ECICS cover note" | null,
    "ask": "what to ask for in the same email" | null,
    "project": "the project or cover, e.g. Dover Drive show flat" | null,
    "line": "the line of cover, e.g. CAR" | null,
    "why": "the reason, under 12 words, only if not obvious" | null
  }],
  "facts": ${FACTS_SPEC}
}

How the steps read (code writes the sentence from your parts, so fill the parts exactly):
- send: "Send <who> <what> and ask for <ask>". Put the files to attach in "what".
- quote: "Request a quotation from <insurer> for <project> (<line>)".
- chase: "Chase <who> for <what>", when TRS asked and has had no answer.
- ask: "Ask <who> for <what>".
- confirm: "Confirm cover with <insurer> for <project>".
- update / discard: "Update the draft to <who>: <what>" or "Discard the draft to <who>". DRAFTS NOT SENT lists the drafts; never propose a second email to a person who has one, update or discard it.
- task: work for TRS that is not an email; "what" is the whole instruction, starting with a verb.

Rules:
- Facts only from the threads, files and records given. Never invent a premium, date, name or count. If a figure matters and is not given, the step asks for it.
- The summary is not repeated in the points. Points: the client first, then each insurer; at most three per side; no point repeats another.
- Plain words. Never write: pending, outstanding, ensure, facilitate, regarding, kindly, please be advised, in order to, leverage. Dates as "19 Nov", money as "S$1,868.75", people by name.
- Bring the parties together: when an insurer needs something only the client has, the client step asks for it; when the client asked something only an insurer can answer, the insurer step asks it.
- One email per recipient: four insurers is four steps. Insurer steps name the insurer exactly as in INSURERS ON FILE and copy its product_line. Prefer insurers already on the threads.
- Nothing already done. Nothing the other side still owes before TRS can move: say so in the points instead. At most six steps, most pressing first. No step for a thank-you alone.
- ${FACTS_RULES}`

type Ctx = { state: string; text: string; client: ReadTo | null; clientThread: string | null; insurerThreads: { id: string; domains: Set<string> }[]; anchor: string; subjectOf: Map<string, string>; pending: PendingDraft[]; threadDomains: Set<string> }

/**
 * Everything the model reads for a row: only threads the actor may open (the ring-fence: the
 * server never hands a colleague's private mail to a model for someone else). `only` narrows the
 * row to some threads (one project).
 */
async function context(owner: string, companyId: string | null, threadIds: readonly string[], actor: string | null, only?: ReadonlySet<string>): Promise<Ctx> {
  const onList = (await rowThreads(owner, companyId, threadIds)).filter(r => !only || only.has(r.thread_id))
  if (!onList.length) throw new Error('This client has no threads on your list.')
  const open = await visibleThreadIds(onList.map(r => r.thread_id as string), actor)
  const listed = onList.filter(r => open.has(r.thread_id))
  if (!listed.length) throw new Error('These threads live in a colleague’s inbox. Ask them to read it.')
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

  const pending = await sbTry<Row[]>(`ai_drafts?or=(thread_id.in.${inList(ids)},context_used->>thread_id.in.${inList(ids)})&status=in.(pending,draft)&deleted_at=is.null&select=id,to_email,subject,body,created_at&order=created_at.asc&limit=20`, [])
  const pendingEmails = Array.from(new Set(pending.map(p => bare(String(p.to_email ?? '').split(/[,;]\s*/)[0])).filter(Boolean)))
  const people = pendingEmails.length ? await sbTry<Row[]>(`contacts?email=in.${inList(pendingEmails)}&select=email,first_name,last_name`, []) : []
  const nameBy = new Map(people.map(c => [String(c.email).toLowerCase(), [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null]))
  // Everyone outside TRS on the row's threads: an insurer email to one of them is on the thread.
  const parts = await sbTry<Row[]>(`email_participants?thread_id=in.${inList(ids)}&select=email&limit=2000`, [])
  const threadDomains = new Set([...parts.map(p => bare(p.email)), ...msgs.map(m => bare(m.from_address))].filter(a => a && !isInternal(a)).map(domainOf).filter(Boolean))

  const routes = await routesOnFile()
  const insurersList = Array.from(new Set(routes.map(r => `${r.insurer} — ${r.productLine}`))).sort()
  const text = [
    `CLIENT: ${company?.company_name ?? 'not filed'}`,
    policies.length ? `POLICIES ON FILE:\n${policies.map(p => `- ${p.class_of_insurance ?? ''} · ${p.insurer ?? ''} · ${p.policy_number ?? ''} · ${p.start_date ?? '?'} to ${p.end_date ?? '?'} · ${p.lifecycle ?? ''}`).join('\n')}` : 'POLICIES ON FILE: none',
    placements.length ? `OPEN PLACEMENTS:\n${placements.flatMap(p => (p.placement_lines ?? []).map((l: Row) => `- ${l.label ?? l.product_line} · client side ${l.client_stage ?? 'not set'} · insurer side ${l.insurer_stage ?? 'not set'}${l.renewal_date ? ` · renews ${l.renewal_date}` : ''}`)).join('\n')}` : 'OPEN PLACEMENTS: none',
    `INSURERS ON FILE (name — product_line):\n${insurersList.join('\n')}`,
    blocks.join('\n\n'),
    pending.length ? `DRAFTS NOT SENT:\n${pending.map(p => `- to ${p.to_email} · written ${String(p.created_at).slice(0, 10)} · ${p.subject ?? ''}\n${trim(p.body, 600)}`).join('\n')}` : 'DRAFTS NOT SENT: none',
    others.length ? `THE CLIENT'S OTHER RECENT THREADS (latest message only):\n${others.map(o => `- ${o.subject ?? ''} · ${String(o.last?.sent_at ?? o.last_message_at ?? '').slice(0, 10)} · ${o.last?.from_address ?? ''}: ${trim(ownWords(o.last?.body_text), 400)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  const pendingList: PendingDraft[] = pending.map(p => { const email = bare(String(p.to_email ?? '').split(/[,;]\s*/)[0]); return { id: p.id as string, email, name: nameBy.get(email) ?? null } }).filter(p => p.email)
  const state = threadState(threads.map(t => ({ threadId: t.id as string, lastAt: (t.last_message_at as string | null) ?? null })))
  return { state, text, client, clientThread, insurerThreads, anchor: clientThread ?? ids[0], subjectOf, pending: pendingList, threadDomains }
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
  // Points come as parts ({ side, who, text, date }), written by pointLine; an older read sent strings.
  const lines = raw.map(p => (p && typeof p === 'object' ? pointLine(p as PointParts) : plain(String(p ?? '')))).filter(Boolean)
  // The client first, then the insurers, as the model was asked; at most six.
  return [...lines.filter(l => l.startsWith('Client')), ...lines.filter(l => !l.startsWith('Client'))].slice(0, 6).map(p => p.slice(0, 220))
}

/** Pure. Each step's sentence from its parts (read-words.ts), and its detail the reason in plain words. */
export function wordSteps(raw: unknown[]): { kind?: string; party?: string; insurer?: string | null; product_line?: string | null; title: string; detail: string }[] {
  return raw.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object').map(s => {
    const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : null)
    return {
      kind: str('kind') ?? undefined, party: str('party') ?? undefined, insurer: str('insurer'), product_line: str('product_line'),
      title: stepTitle({ verb: str('verb'), who: str('who'), what: str('what'), ask: str('ask'), insurer: str('insurer'), project: str('project'), line: str('line'), title: str('title') }),
      detail: plain(str('why') ?? str('detail')),
    }
  }).filter(s => s.title)
}

/**
 * Pure. One person, one email: a suggested email to someone who already has an unsent draft becomes
 * an action to fold it into that draft, whatever the model proposed.
 */
export function oneEmailPerPerson(steps: ReadStep[], pending: readonly PendingDraft[]): ReadStep[] {
  return steps.map(s => {
    const to = s.to?.email.toLowerCase()
    const d = to ? pending.find(p => p.email === to) : undefined
    if (s.kind !== 'email' || !d) return s
    const who = d.name ?? s.to?.name ?? personName(to)
    return { ...s, kind: 'action', title: `Update the draft to ${who}: ${s.title.charAt(0).toLowerCase()}${s.title.slice(1)}`.slice(0, 140), detail: s.detail, to: null, op: 'update', draftId: d.id }
  })
}

export type PendingDraft = { id: string; email: string; name: string | null }

/**
 * Pure. The model's own "Discard / Update the pending email to <name>" actions, tied to that draft
 * when exactly one unsent draft matches the email address or the person's name.
 */
export function linkPending(steps: ReadStep[], pending: readonly PendingDraft[]): ReadStep[] {
  return steps.map(s => {
    if (s.kind !== 'action' || s.op) return s
    const title = s.title.toLowerCase()
    const op = /^(discard|delete|drop|cancel)\b/.test(title) ? 'discard' : /^(update|add to|amend|revise|edit)\b/.test(title) ? 'update' : null
    if (!op || !/pending|draft|unsent/.test(title)) return s
    const text = `${s.title} ${s.detail}`.toLowerCase()
    const hits = pending.filter(p => text.includes(p.email) || (p.name && (text.includes(p.name.toLowerCase()) || text.includes(` ${p.name.toLowerCase().split(' ')[0]} `) || text.includes(` ${p.name.toLowerCase().split(' ')[0]}`))))
    const ids = Array.from(new Set(hits.map(h => h.id)))
    return ids.length === 1 ? { ...s, op, draftId: ids[0] } : s
  })
}

/** Pure. An insurer email goes to someone already on the client's threads, or to a contact picked from the Insurers page. */
export function markSource(steps: ReadStep[], threadDomains: ReadonlySet<string>): ReadStep[] {
  return steps.map(s => s.kind === 'email' && s.party === 'insurer' && s.to ? { ...s, source: threadDomains.has(domainOf(s.to.email.toLowerCase())) ? 'thread' : 'file' } : s)
}

/** One model read of the row. The points ride in the plan's situation, one per line. */
export async function readRow(owner: string, companyId: string | null, threadIds: readonly string[], actor: string): Promise<ReadPlan> {
  const ctx = await context(owner, companyId, threadIds, actor)
  const r = await callGemini({ agent: 'crm', feature: 'today_read', model: GEMINI_DEEP, system: SYSTEM, parts: [{ text: ctx.text }], json: true, maxOutputTokens: 6_000, thinkingShare: 0.3, temperature: 0.2, metadata: { company_id: companyId, by: actor, threads: threadIds.length } })
  if (!r.text) throw new Error(r.error ?? 'The model returned nothing.')
  const raw = parseJsonLoose<{ summary?: string; points?: unknown; steps?: unknown[]; facts?: unknown }>(r.text)
  if (!raw) {
    void logError({ source: 'gemini', feature: 'today_read', message: `Unreadable output (${r.text.length} chars): ${r.text.slice(0, 400)} … ${r.text.slice(-300)}` })
    throw new Error('The model’s answer was not readable. Press Read again.')
  }
  const plan = shapePlan({ summary: plain(raw.summary), situation: normalisePoints(raw.points).join('\n'), steps: wordSteps(raw.steps ?? []) }, await routesOnFile(), ctx.client, actor, GEMINI_DEEP)
  plan.steps = markSource(linkPending(oneEmailPerPerson(plan.steps, ctx.pending), ctx.pending), ctx.threadDomains).slice(0, 6)
  await save(keyOf(owner, companyId, threadIds), plan)
  // The Read's facts are the client's condensed state too (checked like Condense's).
  if (raw.facts) await saveCondensed(rowKey(owner, companyId, threadIds[0] ?? ''), null, { at: plan.at, by: actor, state: ctx.state, project: null, facts: checkFacts(raw.facts, ctx.text) }).catch(() => {})
  return plan
}

// ── Condense (20 Nov 2026) ───────────────────────────────────────────────────────────────────────

const CONDENSE_SYSTEM = `You are the chief of staff of a Singapore insurance broker (Trade Risk Solutions, "TRS"). Read every email thread given for this client and set out where things stand as facts, never prose.

Return ONLY JSON:
${FACTS_SPEC}

Rules:
- ${FACTS_RULES}
- Facts only from the threads, files and records given. Never invent a premium, date, name or count.`

async function saveCondensed(rowK: string, project: string | null, c: Condensed): Promise<void> {
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: condenseKey(rowK, project), value: JSON.stringify(c), updated_at: new Date().toISOString() }) })
}

/** A condensed result kept for a row (and project), or null. */
export async function loadCondensed(rowK: string, project: string | null): Promise<Condensed | null> {
  const [r] = await sbTry<Row[]>(`app_settings?key=eq.${enc(condenseKey(rowK, project))}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) as Condensed } catch { return null }
}

/**
 * Condense a client, or one project of it (`threadIds` = the project's threads), into labelled
 * facts. One model call on a person's button; when the threads have not changed since the last
 * one, the kept result comes back and no model is called.
 */
export async function condenseRow(owner: string, companyId: string | null, rowThreadIds: readonly string[], project: string | null, threadIds: readonly string[], actor: string): Promise<Condensed> {
  const rowK = rowKey(owner, companyId, rowThreadIds[0] ?? '')
  const ctx = await context(owner, companyId, rowThreadIds, actor, project ? new Set(threadIds) : undefined)
  const kept = await loadCondensed(rowK, project)
  if (kept && kept.state === ctx.state) return kept
  const r = await callGemini({ agent: 'crm', feature: 'today_condense', model: GEMINI_DEEP, system: CONDENSE_SYSTEM, parts: [{ text: ctx.text }], json: true, maxOutputTokens: 3_000, thinkingShare: 0.3, temperature: 0.1, metadata: { company_id: companyId, by: actor, project, threads: threadIds.length } })
  if (!r.text) throw new Error(r.error ?? 'The model returned nothing.')
  const raw = parseJsonLoose<unknown>(r.text)
  if (!raw) throw new Error('The model’s answer was not readable. Press Condense again.')
  const out: Condensed = { at: new Date().toISOString(), by: actor, state: ctx.state, project, facts: checkFacts(raw, ctx.text) }
  await saveCondensed(rowK, project, out)
  return out
}

/** Writes each ticked email as a pending draft on the row: client replies on the client thread, insurer emails on that insurer's thread when there is one. */
export async function draftRow(owner: string, companyId: string | null, threadIds: readonly string[], stepIds: readonly string[], actor: string): Promise<ReadPlan> {
  const key = keyOf(owner, companyId, threadIds)
  const plan = await load(key)
  if (!plan) throw new Error('Read this client first.')
  const ctx = await context(owner, companyId, threadIds, actor)
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

/** One button on a Read action: discard the unsent draft, rewrite it as the step says, or mark the step done. */
export async function actOnStep(owner: string, companyId: string | null, threadIds: readonly string[], stepId: string, act: 'discard' | 'update' | 'done', actor: string): Promise<ReadPlan> {
  const key = keyOf(owner, companyId, threadIds)
  const plan = await load(key)
  if (!plan) throw new Error('Read this client first.')
  const step = plan.steps.find(s => s.id === stepId)
  if (!step) throw new Error('That step is no longer on the Read.')
  if (act !== 'done') {
    if (!step.draftId || step.op !== act) throw new Error('This step is not tied to an unsent email.')
    if (act === 'discard') {
      await sb(`ai_drafts?id=eq.${enc(step.draftId)}&status=in.(pending,draft)`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', rejection_note: `discarded from Today by ${actor}` }) })
    } else {
      await rewriteDraft(step.draftId, `${step.title}. ${step.detail}`, actor)
    }
  }
  step.status = 'done'
  await save(key, plan)
  return plan
}
