/**
 * "Read thread": the model reads one thread end to end (messages, files, the case and placement
 * it belongs to, the insurers on file) and proposes the next steps as a checklist: emails, each to
 * one person at one party, and actions for TRS. The person ticks what to do; Draft writes every
 * ticked email as its own pending draft (one address in To), which the bar then shows for review
 * and send. Nothing sends from here.
 *
 * The plan lives in app_settings under thread_read:<id>, so it survives reloads and shows to the
 * next person who opens the thread. shapePlan and pickRoute are pure (src/__tests__/thread-read.test.ts).
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_DEEP, GEMINI_FLASH } from '@/lib/gemini-models'
import { sb, sbTry, enc, isInternal } from '@/lib/crm/db'
import { listProducts } from '@/lib/insurer-products'
import { contactIdFor } from '@/lib/placement/store'
import { ownWords } from '@/lib/admin/b/relay/intent'

type Row = Record<string, any>

export type ReadRoute = { insurer: string; productLine: string; email: string; name: string | null; contactId: string | null; isDefault: boolean }
export type ReadTo = { email: string; name: string | null; contactId: string | null }
export type ReadStep = {
  id: string; kind: 'email' | 'action'; party: 'client' | 'insurer' | 'internal'
  insurer: string | null; productLine: string | null; title: string; detail: string
  to: ReadTo | null
  status: 'proposed' | 'todo' | 'drafted' | 'done'; draftId: string | null
}
export type ReadPlan = { at: string; by: string; summary: string; situation: string; steps: ReadStep[]; model: string }

type RawStep = { kind?: string; party?: string; insurer?: string | null; product_line?: string | null; title?: string; detail?: string; to_name?: string | null }
type RawPlan = { summary?: string; situation?: string; steps?: RawStep[] }

const MAX_STEPS = 8
const first = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase().split(/[\s(]+/)[0] ?? ''

/** The person at an insurer for a product line: its default contact, else anyone on that product, else anyone at the insurer. */
export function pickRoute(routes: readonly ReadRoute[], insurer: string | null | undefined, productLine: string | null | undefined): ReadRoute | null {
  const key = first(insurer)
  if (!key) return null
  const mine = routes.filter(r => first(r.insurer) === key || r.insurer.toLowerCase().includes(String(insurer).toLowerCase()))
  if (!mine.length) return null
  const line = productLine ? mine.filter(r => r.productLine === productLine) : []
  const pool = line.length ? line : mine
  return pool.find(r => r.isDefault) ?? pool[0]
}

/** The model's plan made safe: known kinds and parties, a real person on every email, at most eight steps. */
export function shapePlan(raw: RawPlan, routes: readonly ReadRoute[], client: ReadTo | null, by: string, model: string, now = new Date()): ReadPlan {
  const steps: ReadStep[] = []
  const seen = new Set<string>()
  for (const [i, s] of (raw.steps ?? []).entries()) {
    const title = String(s.title ?? '').trim()
    if (!title || seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())
    const party: ReadStep['party'] = s.party === 'insurer' ? 'insurer' : s.party === 'internal' ? 'internal' : 'client'
    let kind: ReadStep['kind'] = s.kind === 'email' ? 'email' : 'action'
    const insurer = s.insurer?.trim() || null
    const productLine = s.product_line?.trim() || null
    let to: ReadTo | null = null
    if (kind === 'email' && party === 'insurer') {
      const r = pickRoute(routes, insurer, productLine)
      if (r) to = { email: r.email, name: r.name, contactId: r.contactId }
      // No one on file at that insurer: the email cannot go, so the step is to find the person.
      else kind = 'action'
    } else if (kind === 'email' && party === 'client') {
      to = client
      if (!to) kind = 'action'
    } else if (kind === 'email') kind = 'action'
    steps.push({
      id: `s${i + 1}`, kind, party, insurer, productLine, title: title.slice(0, 140),
      detail: String(s.detail ?? '').trim().slice(0, 600) + (kind === 'action' && s.kind === 'email' && party === 'insurer' ? ` (no contact on file at ${insurer ?? 'the insurer'}; add one on the Insurers page)` : ''),
      to, status: 'proposed', draftId: null,
    })
    if (steps.length >= MAX_STEPS) break
  }
  return { at: now.toISOString(), by, summary: String(raw.summary ?? '').trim().slice(0, 400), situation: String(raw.situation ?? '').trim().slice(0, 1200), steps, model }
}

const READ_SYSTEM = `You are the chief of staff of a Singapore insurance broker (Trade Risk Solutions, "TRS"). You read one email thread with its files and the case it belongs to, and you set out the next steps.

Return ONLY JSON:
{
  "summary": "one sentence: where this stands",
  "situation": "two to four short sentences: what each side has asked or sent, what is outstanding, any deadline",
  "steps": [{
    "kind": "email" | "action",
    "party": "client" | "insurer" | "internal",
    "insurer": string | null,
    "product_line": string | null,
    "title": "imperative, under 12 words",
    "detail": "what the email must achieve or what the action is, one or two sentences"
  }]
}

Rules:
- One email per recipient: an enquiry going to four insurers is four steps, one per insurer, never one step "email the insurers".
- party "insurer" steps name the insurer exactly as in the INSURERS ON FILE list and copy its product_line; pick insurers that write that class. If the thread already names the insurers, use those.
- party "client" steps go to the client's contact on the thread.
- "action" is work for TRS that is not an email: check a document, call someone, update the register, calculate, file.
- Nothing already done in the thread. Nothing the other side still owes before TRS can move. At most eight steps, most pressing first.
- No step for a thank-you or an acknowledgement alone.`

const trim = (s: string | null | undefined, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n)
const bareAddress = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const bareName = (a: string | null | undefined) => (String(a ?? '').includes('<') ? String(a).split('<')[0].replace(/"/g, '').trim() : '') || null

async function routesOnFile(): Promise<ReadRoute[]> {
  const products = await listProducts({ activeOnly: true }).catch(() => [])
  return products.flatMap((p: Row) => (p.contacts ?? []).filter((c: Row) => c.email).map((c: Row) => ({
    insurer: String(p.insurer_name ?? ''), productLine: String(p.product_line ?? ''), email: String(c.email).toLowerCase(), name: c.name ?? null, contactId: c.contact_id ?? null, isDefault: !!c.is_default,
  })))
}

/** Everything the reader sees, as text. */
async function context(threadId: string) {
  const [thread] = await sb<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=id,subject,company_id,companies(company_name,kind)&limit=1`)
  if (!thread) throw new Error('This thread no longer exists.')
  const msgs = (await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=id,direction,from_address,subject,body_text,sent_at,has_attachments&order=sent_at.desc&limit=15`, [])).reverse()
  const atts = await sbTry<Row[]>(`email_attachments?thread_id=eq.${enc(threadId)}&parsed_text=not.is.null&select=filename,parsed_text,created_at&order=created_at.desc&limit=12`, [])
  const seenFiles = new Set<string>()
  let budget = 14_000
  const files = atts.filter(a => !seenFiles.has(a.filename) && seenFiles.add(a.filename)).map(a => { const t = trim(a.parsed_text, Math.min(3_000, Math.max(0, budget))); budget -= t.length; return t ? `# FILE: ${a.filename}\n${t}` : '' }).filter(Boolean)
  const [link] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(threadId)}&select=work_items(id,title,case_type,status,next_action,needs_human,deadline,insurer_name)&limit=1`, [])
  const item = link?.work_items as Row | undefined
  const inbound = [...msgs].reverse().find(m => m.direction === 'inbound' && !isInternal(bareAddress(m.from_address)))
  const client: ReadTo | null = inbound ? { email: bareAddress(inbound.from_address), name: bareName(inbound.from_address), contactId: null } : null
  const routes = await routesOnFile()
  const insurersList = Array.from(new Map(routes.map(r => [`${r.insurer}|${r.productLine}`, r])).values()).map(r => `${r.insurer} — ${r.productLine}`).sort()
  const text = [
    `THREAD: ${thread.subject ?? ''}`,
    `COMPANY ON FILE: ${thread.companies?.company_name ?? 'none'} (${thread.companies?.kind ?? 'unknown'})`,
    item ? `CASE: ${item.title} · ${item.case_type} · ${item.status}${item.deadline ? ` · deadline ${item.deadline}` : ''}${item.insurer_name ? ` · insurer ${item.insurer_name}` : ''}\nCASE NEXT ACTION ON FILE: ${item.next_action ?? '-'}${item.needs_human ? `\nQUESTION FOR A PERSON: ${item.needs_human}` : ''}` : 'CASE: none opened yet',
    `INSURERS ON FILE (name — product_line):\n${insurersList.join('\n')}`,
    `MESSAGES, oldest first:\n${msgs.map(m => `--- ${String(m.sent_at).slice(0, 16)} ${m.direction} from ${m.from_address}${m.has_attachments ? ' (files attached)' : ''}\n${trim(ownWords(m.body_text), 2_500)}`).join('\n\n')}`,
    files.join('\n\n'),
  ].join('\n\n')
  return { thread, msgs, item, client, routes, text }
}

async function planOf(threadId: string): Promise<ReadPlan | null> {
  const [r] = await sbTry<Row[]>(`app_settings?key=eq.${enc(`thread_read:${threadId}`)}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) as ReadPlan } catch { return null }
}
async function savePlan(threadId: string, plan: ReadPlan): Promise<void> {
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: `thread_read:${threadId}`, value: JSON.stringify(plan), updated_at: new Date().toISOString() }) })
}
export const loadReadPlan = planOf

/** Reads the thread and writes the plan. One model call. */
export async function readThread(threadId: string, actor: string): Promise<ReadPlan> {
  const ctx = await context(threadId)
  const r = await callGemini({ agent: 'crm', feature: 'thread_read', model: GEMINI_DEEP, system: READ_SYSTEM, parts: [{ text: ctx.text }], json: true, maxOutputTokens: 6_000, thinkingShare: 0.3, temperature: 0.2, metadata: { thread_id: threadId, by: actor } })
  if (!r.text) throw new Error(r.error ?? 'The model returned nothing.')
  let raw: RawPlan
  try { raw = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { throw new Error('The model’s answer was not a plan.') }
  const plan = shapePlan(raw, ctx.routes, ctx.client, actor, GEMINI_DEEP)
  await savePlan(threadId, plan)
  return plan
}

const DRAFT_SYSTEM = `You write one outgoing email for Trade Risk Solutions, a Singapore insurance broker, to the person named. Plain, courteous business English. Short paragraphs. No exclamation marks. State what is attached or asked for, and any date. Open with "Dear <first name>," and close with:

Best regards,
{owner_name}
Trade Risk Solutions

Say a file is attached only when the PURPOSE says one is attached; otherwise say it follows separately. For a new email to an insurer, the subject names the client and the cover; for a reply to the client, keep the thread subject.

Return ONLY JSON: {"subject": string, "body": string}. Keep {owner_name} exactly as written.`

/** Drafts every ticked email step as its own pending draft; marks ticked actions as to do. */
export async function executePlan(threadId: string, stepIds: readonly string[], actor: string): Promise<ReadPlan> {
  const plan = await planOf(threadId)
  if (!plan) throw new Error('Read the thread first.')
  const ctx = await context(threadId)
  const picked = new Set(stepIds)
  for (const step of plan.steps) {
    if (!picked.has(step.id) || step.status !== 'proposed') continue
    if (step.kind === 'action') { step.status = 'todo'; continue }
    if (!step.to) continue
    const prompt = [
      `TO: ${step.to.name ?? step.to.email} <${step.to.email}>${step.party === 'insurer' ? ` at ${step.insurer}` : ' (the client)'}`,
      `PURPOSE: ${step.title}. ${step.detail}`,
      `THREAD SUBJECT: ${ctx.thread.subject ?? ''}`,
      '', ctx.text.slice(0, 20_000),
    ].join('\n')
    const r = await callGemini({ agent: 'crm', feature: 'thread_read_draft', model: GEMINI_FLASH, system: DRAFT_SYSTEM, parts: [{ text: prompt }], json: true, maxOutputTokens: 2_500, thinkingShare: 0.2, temperature: 0.3, metadata: { thread_id: threadId, step: step.id } })
    if (!r.text) throw new Error(r.error ?? `No draft for "${step.title}".`)
    let out: { subject?: string; body?: string }
    try { out = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { throw new Error(`The draft for "${step.title}" was not readable.`) }
    const subject = (out.subject ?? '').trim() || (step.party === 'client' && ctx.thread.subject ? `Re: ${String(ctx.thread.subject).replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '')}` : step.title)
    const body = (out.body ?? '').trim()
    if (!body) throw new Error(`The draft for "${step.title}" came back empty.`)
    const contactId = step.to.contactId ?? await contactIdFor(step.to.email, step.to.name)
    if (!contactId) throw new Error(`Could not record ${step.to.email} as a contact.`)
    const [d] = await sb<Row[]>('ai_drafts', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        contact_id: contactId, thread_id: step.party === 'client' ? threadId : null, channel: 'email', email_type: 'CASE_WORK', status: 'pending', generated_by: 'gemini',
        to_email: step.to.email, subject, body, attachments: [], party: step.party, context_used: { agent: 'bar', kind: 'read_step', step: step.id, thread_id: threadId, insurer: step.insurer },
      }),
    })
    step.status = 'drafted'; step.draftId = d?.id ?? null
  }
  await savePlan(threadId, plan)
  return plan
}

export async function setStep(threadId: string, stepId: string, status: ReadStep['status']): Promise<ReadPlan> {
  const plan = await planOf(threadId)
  if (!plan) throw new Error('Read the thread first.')
  const s = plan.steps.find(x => x.id === stepId)
  if (!s) throw new Error('Unknown step.')
  s.status = status
  await savePlan(threadId, plan)
  return plan
}
