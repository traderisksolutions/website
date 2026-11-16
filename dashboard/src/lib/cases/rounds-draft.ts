/**
 * A next step's email, written from the template for its kind (relay/compose.ts). No model is called.
 *
 *   draftStep(caseId, stepId, actor)   the unsent email for one step, made once
 *   runSteps(caseId, actor)            the unsent email for every step that has one, in order
 *
 * The step is found again from the emails as they stand, so a step no longer owed is not drafted.
 * The email passes on the other side's own words and files, goes to whoever last wrote on the
 * side it is for (recipientFor in rounds.ts) on that thread, and joins the case's unsent emails:
 * the case's draft when it has none, beside it otherwise. A person edits and sends it from Overview.
 * The client agent writes to the client, the insurer agent to an insurer; each draft records
 * which, so the share sent as written can be counted per agent.
 */
import { randomUUID } from 'crypto'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { greetingFor } from '@/lib/admin/b/contact-id'
import { storeDraft } from '@/lib/admin/b/drafter'
import { CLASS_OF, composeRelay, isSignatureImage, PARTY_OF, type RelayFacts } from '@/lib/admin/b/relay/compose'
import { detectLine, listedAsks, ownWords } from '@/lib/admin/b/relay/intent'
import { extractQuoteTerms } from '@/lib/admin/b/relay/terms'
import { latestText } from '@/lib/nexus/reader'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { CaseError } from './sources-store'
import { recipientFor, type Step } from './rounds'
import { caseMail, roundsOf, stepDrafts } from './rounds-store'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
const OPEN = 'status=in.(pending,draft)'
const QUOTE_MAX = 800

export const STEP_AGENT: Record<NonNullable<Step['to']>, string> = { client: 'client_agent', insurer: 'insurer_agent' }
export type StepDrafted = { draft_id: string; to: string; /** The step already had an unsent email. */ existing: boolean }
export type StepsRun = { made: number; existing: number; /** Steps left without an email, each with the reason. */ skipped: { step: string; reason: string }[] }

export async function draftStep(workItemId: string, stepId: string, actor: string): Promise<StepDrafted> {
  const c = await caseMail(workItemId, actor)
  if (c.item.closed_at) throw new CaseError('This case is closed.', 400)
  const { rounds, steps } = roundsOf(c)
  const step = steps.find(s => s.id === stepId)
  if (!step) throw new CaseError('This step is no longer waiting. The case has moved on.', 404)
  if (step.act !== 'draft' || !step.draft || !step.to || !step.message_id) throw new CaseError('This step has no email to draft.', 400)
  const source = c.messages.find(m => m.id === step.message_id)
  if (!source) throw new CaseError('The email this step rests on is not on the case.', 404)
  if (!c.visible.has(source.thread_id)) throw new CaseError('The email this step rests on is in a colleague\'s mailbox.', 403)

  const made = (await stepDrafts(workItemId))[step.id]
  if (made) {
    const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(made)}&select=to_email&limit=1`, [])
    return { draft_id: made, to: String(d?.to_email ?? ''), existing: true }
  }
  const who = recipientFor(step, rounds, c.messages, c.visible, c.domainKind)
  if (!who) throw new CaseError(step.to === 'insurer' ? `No email on the case names an address for ${step.insurer ?? 'the insurer'}.` : 'No email on the case names an address for the client.', 409)

  const kind = step.draft
  const text = ownWords(latestText(source.body_text, 6000))
  const [[thread], [policy], [company], files] = await Promise.all([
    sbTry<Row[]>(`email_threads?id=eq.${enc(who.thread_id)}&select=subject&limit=1`, []),
    c.item.policy_id ? sbTry<Row[]>(`policies?id=eq.${enc(c.item.policy_id)}&select=policy_number,class_of_insurance,product_line,start_date,end_date&limit=1`, []) : Promise.resolve([] as Row[]),
    c.item.company_id ? sbTry<Row[]>(`companies?id=eq.${enc(c.item.company_id)}&select=company_name&limit=1`, []) : Promise.resolve([] as Row[]),
    sbTry<Row[]>(`email_attachments?message_id=eq.${enc(source.id)}&select=message_id,filename,mime_type,storage_url&order=created_at.asc`, []),
  ])
  const attachments = files.filter(f => f.filename && !isSignatureImage(f.filename, f.mime_type)).map(f => ({ filename: String(f.filename), mime_type: f.mime_type ?? null, storage_url: f.storage_url ?? null, message_id: String(f.message_id) }))
  const names = attachments.map(f => f.filename)
  const line = detectLine(`${source.subject ?? ''}\n${text}`, policy?.product_line ?? c.item.product_line ?? null)
  const asks = kind === 'relay_question' ? listedAsks(text) : []
  const facts: RelayFacts = {
    greetingName: await greetingFor(who.to), clientName: company?.company_name ?? c.item.client_name ?? null, insurerName: step.insurer,
    lineLabel: PRODUCT_LINES.find(l => l.slug === line)?.label ?? null, policyNumber: policy?.policy_number ?? null, className: policy?.class_of_insurance ?? policy?.product_line ?? null,
    periodFrom: policy?.start_date ?? null, periodTo: policy?.end_date ?? null, threadSubject: thread?.subject ?? null, title: String(c.item.title ?? ''),
    original: { from: source.from_address ?? '', sent_at: source.sent_at ?? null, subject: source.subject ?? null, text },
    files: names,
    ...(kind === 'relay_quote' ? { terms: extractQuoteTerms(text) } : {}),
    ...(kind === 'relay_question' ? { asks, quoted: asks.length ? null : text.slice(0, QUOTE_MAX) } : {}),
    ...(kind === 'relay_decline' || kind === 'relay_decision' ? { quoted: text.slice(0, QUOTE_MAX) } : {}),
  }
  const built = composeRelay(kind, facts)

  // The case's own unsent email stays; this one is listed beside it.
  const [held] = c.item.draft_id ? await sbTry<Row[]>(`ai_drafts?id=eq.${enc(c.item.draft_id)}&${OPEN}&select=id,pair_id&limit=1`, []) : []
  const pairId = (held?.pair_id as string | null | undefined) ?? randomUUID()
  if (held && !held.pair_id) await sb(`ai_drafts?id=eq.${enc(held.id)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ pair_id: pairId }) })
  const id = await storeDraft(workItemId, { thread_id: who.thread_id, to: [who.to], cc: who.cc, subject: built.subject, body: built.body, kind, party: PARTY_OF[kind], pair_id: pairId, attachments }, { primary: !held })
  await sb(`ai_drafts?id=eq.${enc(id)}`, {
    method: 'PATCH', headers: quiet,
    body: JSON.stringify({ draft_class: CLASS_OF[kind], context_used: { agent: STEP_AGENT[step.to], kind, step: step.id, message_id: source.id, basis: `step started by ${actor}; address from email ${who.message_id}` } }),
  })
  return { draft_id: id, to: who.to, existing: false }
}

/**
 * A person's Run: every step that has an email is drafted, one after another, so each draft joins
 * the unsent emails the one before it left. A step that cannot be drafted is passed over with its reason.
 */
export async function runSteps(workItemId: string, actor: string): Promise<StepsRun> {
  const c = await caseMail(workItemId, actor)
  if (c.item.closed_at) throw new CaseError('This case is closed.', 400)
  const run: StepsRun = { made: 0, existing: 0, skipped: [] }
  for (const step of roundsOf(c).steps) {
    if (step.act !== 'draft') continue
    try {
      const d = await draftStep(workItemId, step.id, actor)
      if (d.existing) run.existing++
      else run.made++
    } catch (e) {
      if (!(e instanceof CaseError)) throw e
      run.skipped.push({ step: step.text, reason: e.message })
    }
  }
  return run
}
