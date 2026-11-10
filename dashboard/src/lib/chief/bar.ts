/**
 * The next-actions bar on a thread: who it waits on, when the chaser is due, the drafts the agents
 * prepared for it, and for a new policy enquiry the emails to each insurer. No model is called
 * here; a reply is only written by a model when someone clicks for one. Nothing here sends.
 *
 * Snooze and "no action" are kept per thread in app_settings under thread_bar:<id>.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { chaseDueOn } from '@/lib/admin/b/cadence'
import { daysBetween, isoDay, workingDaysBetween } from '@/lib/admin/b/dates'
import { contactIdFor } from '@/lib/admin/b/contact-id'
import { detectIntent, ownWords } from '@/lib/admin/b/relay/intent'
import { addressesIn, oneRecipient } from '@/lib/email/recipients'
import { autoReplyAfter, isAutoReply, lastRealMessage, type WaitMessage } from '@/lib/threads/waiting'
import * as store from '@/lib/placement/store'
import { reviewQueue } from '@/lib/placement/workflow'
import { suggestionsFor, type Suggestion } from './suggest'
import { loadReadPlan, type ReadPlan } from './read'

type Row = Record<string, any>
export type Side = 'client' | 'insurer'

export type BarState =
  | { kind: 'reply'; person: string | null; email: string | null; side: Side; since: string | null }
  | { kind: 'waiting'; person: string | null; email: string | null; side: Side; sentAt: string | null; chaseDue: string; workingDaysLeft: number; overdue: boolean; snoozed: boolean }
  | { kind: 'none' }

export type BarDraft = {
  id: string; to: string; person: string | null; cc: string; subject: string; body: string; label: string; workItemId: string | null
  attachments: { filename: string; mime_type?: string; storage_url: string }[]; removed: string[]
}
export type BarRecipient = { dispatchId: string; insurer: string; person: string | null; email: string }
export type BarRequest = {
  draftId: string; line: string; subject: string; body: string; recipients: BarRecipient[]
  attachments: { filename: string; mime_type?: string; storage_url: string }[]
}
export type BarEnquiry = {
  stage: 'detected' | 'ready' | 'sent'
  placementId: string | null; policies: number; emails: number; sent: number; requests: BarRequest[]; awaitingDetails: string[]
}
export type Bar = {
  threadId: string; companyId: string | null; state: BarState; autoReply: { from: string; at: string | null } | null
  drafts: BarDraft[]; enquiry: BarEnquiry | null; suggestions: Suggestion[]; read: ReadPlan | null; caseItem: { id: string; title: string; nextAction: string | null } | null
  hold: { noAction?: boolean; until?: string } | null; today: string
}

const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const singaporeToday = () => isoDay(new Date(Date.now() + 8 * 3_600_000))
const nameOf = (c: Row | undefined) => c ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null : null

const DRAFT_LABEL: Record<string, string> = {
  gb_client_options: 'Pricing options to client',
  CASE_WORK: 'Prepared email', CONVERSATION: 'Reply', RENEWAL: 'Renewal email', POLICY_MOVEMENT: 'Movement email', PLACEMENT_REQUEST: 'Request', NEXUS: 'Email',
}

/** Pure. The waiting half of the state: the person written to, and when the chaser falls due. */
export function waitingState(sentAt: string, person: string | null, email: string | null, side: Side, today: string, snoozeUntil?: string | null): BarState {
  const chaseDue = snoozeUntil && snoozeUntil > chaseDueOn(sentAt, side) ? snoozeUntil : chaseDueOn(sentAt, side)
  return {
    kind: 'waiting', person, email, side, sentAt, chaseDue, snoozed: !!snoozeUntil && chaseDue === snoozeUntil,
    workingDaysLeft: workingDaysBetween(today, chaseDue), overdue: daysBetween(today, chaseDue) <= 0,
  }
}

/** Pure. A chaser in TRS's words, on the email it follows up. */
export function chaserText(i: { firstName: string | null; subject: string | null; sentOn: string }): { subject: string; body: string } {
  const on = new Date(`${i.sentOn.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const about = (i.subject ?? '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').trim()
  return {
    subject: about ? `Re: ${about}` : 'Follow-up',
    body: `Dear ${i.firstName ?? 'Sir/Madam'},\n\nMay I check on my email of ${on}${about ? ` on ${about}` : ''}?\n\nThank you!\n\nBest regards,\n{owner_name}\nTrade Risk Solutions`,
  }
}

async function holdOf(threadId: string): Promise<(Row & { at?: string }) | null> {
  const [r] = await sbTry<Row[]>(`app_settings?key=eq.${enc(`thread_bar:${threadId}`)}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) } catch { return null }
}

export async function setHold(threadId: string, value: { noAction?: boolean; until?: string; dismissed?: string[]; by: string } | null): Promise<void> {
  const key = enc(`thread_bar:${threadId}`)
  if (!value) { await sb(`app_settings?key=eq.${key}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); return }
  await sb('app_settings?on_conflict=key', {
    method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ key: `thread_bar:${threadId}`, value: JSON.stringify({ ...value, at: new Date().toISOString() }), updated_at: new Date().toISOString() }),
  })
}

/** "Not now" on a suggestion: kept with the thread's hold, so it stays quiet on every screen. */
export async function dismissSuggestion(threadId: string, key: string, by: string): Promise<void> {
  const hold = (await holdOf(threadId)) ?? {}
  const dismissed = Array.from(new Set([...(Array.isArray(hold.dismissed) ? hold.dismissed : []), key]))
  await setHold(threadId, { ...(hold.noAction ? { noAction: true } : {}), ...(hold.until ? { until: hold.until } : {}), dismissed, by })
}

async function sideOf(email: string | null, companyKind: string | null): Promise<Side> {
  const domain = (email ?? '').split('@')[1]
  if (domain) {
    const [c] = await sbTry<Row[]>(`companies?domains=cs.${enc(`{${domain}}`)}&select=kind&limit=1`, [])
    if (c?.kind) return c.kind === 'insurer' ? 'insurer' : 'client'
  }
  return companyKind === 'insurer' ? 'insurer' : 'client'
}

async function peopleByEmail(emails: string[]): Promise<Map<string, string | null>> {
  const list = Array.from(new Set(emails.filter(Boolean)))
  const out = new Map<string, string | null>()
  if (!list.length) return out
  const rows = await sbTry<Row[]>(`contacts?email=in.(${list.map(e => `"${e}"`).join(',')})&select=email,first_name,last_name&limit=200`, [])
  for (const c of rows) out.set(String(c.email).toLowerCase(), nameOf(c))
  return out
}

export async function loadBar(threadId: string): Promise<Bar | null> {
  const [thread] = await sb<Row[]>(`email_threads?id=eq.${enc(threadId)}&deleted_at=is.null&select=id,subject,company_id,contact_id,companies(kind)&limit=1`)
  if (!thread) return null
  const today = singaporeToday()
  const msgs = await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=id,direction,from_address,subject,body_text,sent_at&order=sent_at.asc&limit=500`, [])
  const people = await sbTry<Row[]>(`email_participants?thread_id=eq.${enc(threadId)}&role=in.(to,cc)&select=message_id,email,name,role&limit=1000`, [])
  const withPeople = msgs.map(m => ({ ...m, to: people.filter(p => p.message_id === m.id && p.role === 'to').map(p => p.email), cc: people.filter(p => p.message_id === m.id && p.role === 'cc').map(p => p.email) })) as (Row & WaitMessage)[]
  const last = lastRealMessage(withPeople)
  const auto = autoReplyAfter(withPeople, last)
  const companyKind = (thread.companies as Row | null)?.kind ?? null
  const hold = await holdOf(threadId)
  // A hold ends when the other side writes again.
  const activeHold = hold && last?.direction === 'inbound' && last.sent_at && hold.at && last.sent_at > hold.at ? null : hold

  const named = new Map(people.filter(p => p.name).map(p => [String(p.email).toLowerCase(), p.name as string]))
  let state: BarState = { kind: 'none' }
  if (last?.direction === 'inbound') {
    const email = bare(last.from_address)
    state = { kind: 'reply', person: named.get(email) ?? null, email, side: await sideOf(email, companyKind), since: last.sent_at }
  } else if (last?.sent_at) {
    const email = addressesIn(last.to ?? []).find(a => !/@trade-risksol\.com$/i.test(a)) ?? null
    state = waitingState(last.sent_at, email ? named.get(email) ?? null : null, email, await sideOf(email, companyKind), today, activeHold?.until)
  }

  // Drafts on this thread, requests to insurers apart: those show under the enquiry.
  const rawDrafts = await sbTry<Row[]>(`ai_drafts?or=(thread_id.eq.${enc(threadId)},context_used->>thread_id.eq.${enc(threadId)})&status=in.(pending,draft)&deleted_at=is.null&or=(email_type.is.null,email_type.neq.PLACEMENT_REQUEST)&select=id,to_email,cc,subject,body,email_type,attachments,work_item_id,context_used&order=created_at.desc&limit=10`, [])
  const fallbackTo = 'email' in state ? state.email : null
  const shaped = rawDrafts.map(d => {
    const r = oneRecipient(d.to_email || fallbackTo, d.cc)
    const kind = (d.context_used as Row | null)?.kind
    const label = kind === 'bar_chaser' ? 'Chaser' : kind === 'read_step' ? 'Next step' : DRAFT_LABEL[d.email_type as string] ?? 'Email'
    return { d, r, label }
  })
  const names = await peopleByEmail(shaped.map(x => x.r.to))
  const drafts: BarDraft[] = shaped.map(({ d, r, label }) => ({
    id: d.id, to: r.to, person: names.get(r.to) ?? named.get(r.to) ?? null, cc: r.cc.join(', '), subject: d.subject ?? '', body: d.body ?? '', label, workItemId: d.work_item_id ?? null,
    attachments: Array.isArray(d.attachments) ? d.attachments.filter((a: Row) => a?.storage_url) : [],
    removed: [...r.removed, ...(((d.context_used as Row | null)?.removed_recipients as string[] | undefined) ?? [])],
  }))

  const [link] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(threadId)}&select=work_items(id,title,next_action,closed_at)&limit=5`, [])
  const item = link?.work_items as Row | undefined
  const enquiry = await enquiryOf(threadId, thread, companyKind, withPeople)
  const held = await holdOf(threadId)
  const suggestions = await suggestionsFor(threadId, Array.isArray(held?.dismissed) ? held.dismissed : [])
  const read = await loadReadPlan(threadId)

  return {
    threadId, companyId: thread.company_id ?? null, state, drafts, enquiry, suggestions, read, today,
    autoReply: auto ? { from: bare(auto.from_address), at: auto.sent_at ?? null } : null,
    caseItem: item && !item.closed_at ? { id: item.id, title: item.title, nextAction: item.next_action ?? null } : null,
    hold: activeHold ? { noAction: !!activeHold.noAction, until: activeHold.until } : null,
  }
}

async function enquiryOf(threadId: string, thread: Row, companyKind: string | null, messages: (Row & WaitMessage)[]): Promise<BarEnquiry | null> {
  const placement = await store.placementForClientThread(threadId)
  if (placement) {
    const bundle = await store.loadPlacement(placement.id)
    if (!bundle) return null
    const queue = (await reviewQueue(placement.id)).filter(q => q.kind === 'request')
    const contactIds = Array.from(new Set(queue.flatMap(q => q.dispatches.map(d => d.insurer_contact_id)).filter(Boolean))) as string[]
    const contacts = contactIds.length ? await sbTry<Row[]>(`contacts?id=in.(${contactIds.join(',')})&select=id,first_name,last_name&limit=200`, []) : []
    const lineLabel = (id: string | null) => bundle.lines.find(l => l.id === id)?.label ?? 'Policy'
    const requests: BarRequest[] = queue.map(q => ({
      draftId: q.draft.id, line: lineLabel(q.dispatches[0]?.line_id ?? null), subject: q.draft.subject ?? '', body: q.draft.body ?? '',
      attachments: Array.isArray((q.draft as Row).attachments) ? (q.draft as Row).attachments.filter((a: Row) => a?.storage_url) : [],
      recipients: q.dispatches.filter(d => d.status === 'drafted').map(d => ({
        dispatchId: d.id, insurer: d.insurer_name, email: addressesIn(d.to_email)[0] ?? '',
        person: nameOf(contacts.find(c => c.id === d.insurer_contact_id)),
      })),
    }))
    const sent = bundle.dispatches.filter(d => d.sent_at).length
    const emails = requests.reduce((n, r) => n + r.recipients.length, 0)
    const held = bundle.lines.filter(l => !queue.some(q => q.dispatches[0]?.line_id === l.id) && !bundle.dispatches.some(d => d.line_id === l.id))
    return {
      stage: emails > 0 ? 'ready' : 'sent', placementId: placement.id, policies: bundle.lines.length, emails, sent, requests,
      awaitingDetails: held.map(l => l.label ?? l.product_line ?? 'Policy'),
    }
  }
  if (companyKind !== 'client') return null
  // No request opened yet: a client asking for quotes, read by the relay's rules, so no model.
  const asked = [...messages].reverse().find(m => m.direction === 'inbound' && !isAutoReply(m) && !/@trade-risksol\.com/i.test(String(m.from_address)))
  if (!asked) return null
  const r = detectIntent({ side: 'client', subject: asked.subject ?? thread.subject ?? null, text: ownWords(asked.body_text), files: [], caseType: null })
  return r.intent === 'quote_request'
    ? { stage: 'detected', placementId: null, policies: 0, emails: 0, sent: 0, requests: [], awaitingDetails: [] }
    : null
}

/** The chaser for a thread waiting on someone, as a draft to review; the one already open if there is one. */
export async function draftChaser(threadId: string): Promise<string> {
  const bar = await loadBar(threadId)
  if (!bar || bar.state.kind !== 'waiting' || !bar.state.email || !bar.state.sentAt) throw new Error('This thread is not waiting on anyone.')
  const open = bar.drafts.find(d => d.label === 'Chaser')
  if (open) return open.id
  const [thread] = await sb<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=subject,company_id&limit=1`)
  const contactId = await contactIdFor(bar.state.email, thread?.company_id ?? null)
  if (!contactId) throw new Error(`Could not record ${bar.state.email} as a contact.`)
  const text = chaserText({ firstName: bar.state.person?.split(/\s+/)[0] ?? null, subject: thread?.subject ?? null, sentOn: bar.state.sentAt })
  const [draft] = await sb<Row[]>('ai_drafts', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      contact_id: contactId, thread_id: threadId, channel: 'email', email_type: 'CASE_WORK', status: 'pending', generated_by: 'template',
      to_email: bar.state.email, subject: text.subject, body: text.body, attachments: [], party: bar.state.side, context_used: { agent: 'bar', kind: 'bar_chaser' },
    }),
  })
  return draft.id as string
}
