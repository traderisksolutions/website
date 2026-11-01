/**
 * The drafter: one job, write the email a task asks for and put it on the work item for approval.
 *
 * Kinds: request_missing, chase_insurer, chase_client, renewal_notice, forward_to_insurer.
 * A matter with two parties gets two drafts with one pair_id: chase_insurer comes with a
 * client_update, forward_to_insurer with a client_ack, so one Send covers both sides. The insurer
 * draft is the item's draft_id; its pair is found by pair_id. If the client side has nobody to
 * write to, the insurer draft goes alone.
 *
 * Recipients come from the recipient router; when it has nobody for the main draft, a person is
 * asked and nothing is drafted. An item that already holds an unsent draft keeps it. Nothing
 * here sends.
 */
import { randomUUID } from 'node:crypto'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { latestText } from '@/lib/nexus/reader'
import { askHuman, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { buildDraft, pairFor, partyOf, type DraftKind, type DraftFacts, type Party } from './drafts'
import { routeRecipients, type Route } from './router'
import { loadCaseData, toCaseMail, scopedContacts, groupFacts, itemEvent, insurerLastHandler, insurerClaimsDesk, type CaseData } from './data'

type Row = Record<string, any>
const KINDS: DraftKind[] = ['request_missing', 'chase_insurer', 'chase_client', 'renewal_notice', 'forward_to_insurer']

type Attachment = { filename: string; mime_type: string | null; storage_url: string | null; message_id: string }
type NewDraft = { thread_id: string | null; to: string[]; cc: string[]; subject: string; body: string; kind: string; party: Party; pair_id?: string | null; attachments?: Attachment[] }

export async function storeDraft(workItemId: string, d: NewDraft, opts: { primary?: boolean } = {}): Promise<string> {
  const [contact] = await sbTry<Row[]>(`contacts?email=ilike.${enc(d.to[0])}&select=id&limit=1`, [])
  const [draft] = await sb<Row[]>('ai_drafts', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      contact_id: contact?.id ?? null, thread_id: d.thread_id, channel: 'email', email_type: 'CASE_WORK', status: 'pending',
      generated_by: 'template', to_email: d.to.join(', '), cc: d.cc.join(', ') || null, subject: d.subject, body: d.body,
      attachments: d.attachments ?? [], work_item_id: workItemId, pair_id: d.pair_id ?? null, party: d.party,
      context_used: { agent: 'drafter', kind: d.kind },
    }),
  })
  if (opts.primary !== false) await sb(`work_items?id=eq.${enc(workItemId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: draft.id, updated_at: new Date().toISOString() }) })
  await itemEvent(workItemId, 'draft', 'drafter', { kind: d.kind, draft_id: draft.id, pair_id: d.pair_id ?? null })
  return draft.id as string
}

async function hasOpenDraft(item: Row): Promise<boolean> {
  if (!item.draft_id) return false
  const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&select=status&limit=1`, [])
  return !!d && ['pending', 'draft'].includes(d.status)
}

function scopeFor(kind: DraftKind, d: CaseData): string {
  if (kind === 'renewal_notice') return String(d.policies.find(p => p.id === d.item.policy_id)?.product_line ?? 'renewal').toLowerCase()
  return d.item.case_type === 'claim' ? 'claims' : 'accounts'
}

async function routeSide(side: Party, kind: DraftKind, d: CaseData, claim: Row | undefined, human?: Row): Promise<Route> {
  if (human?.to) return { ok: true, to: String(human.to).split(/[,;]\s*/).filter(Boolean), cc: String(human.cc ?? '').split(/[,;]\s*/).filter(Boolean), basis: `chosen by ${human.by}` }
  const scope = scopeFor(kind, d)
  const company = d.item.company_id as string | null
  const parent = d.company?.parent_id as string | null | undefined
  const insurer = claim?.insurer_name ?? d.item.insurer_name ?? null
  let desk: string[] = []
  if (side === 'insurer') {
    const policy = d.policies.find(p => p.id === (claim?.policy_id ?? d.item.policy_id))
    if (kind === 'forward_to_insurer') desk = await insurerClaimsDesk(insurer, policy?.product_line ?? claim?.class ?? null)
    if (!desk.length) desk = (await groupFacts(company)).filter(f => /desk|claims\.contact|insurer\.contact/.test(f.key) && /@/.test(f.value)).map(f => String(f.value))
  }
  return routeRecipients({
    side, scope,
    // A forward opens the insurer conversation: the last insurer sender on the case is not who to tell.
    messages: kind === 'forward_to_insurer' ? toCaseMail(d).filter(m => m.side !== 'insurer') : toCaseMail(d),
    clientContacts: await scopedContacts(company), groupContacts: parent ? await scopedContacts(parent) : [],
    insurerDesk: desk, insurerLastHandler: side === 'insurer' && !desk.length ? await insurerLastHandler(insurer, scope) : null,
    insurerDomains: d.insurerDomains, departed: d.departed, owner: d.item.owner_email ?? null,
  })
}

function facts(kind: DraftKind, d: CaseData, claim: Row | undefined, greetingName: string | null, task: AgentTask, side: Party): { f: DraftFacts; attachments: Attachment[]; threadId: string | null } {
  const sideThreads = d.threads.filter(t => t.side === side).sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  const thread = sideThreads[0] ?? (side === 'client' ? d.threads.find(t => t.side !== 'insurer') : null) ?? d.threads[0] ?? null
  const lastTrs = [...d.messages].reverse().find(m => m.side === 'trs' && !m.rebuilt)
  const policy = d.policies.find(p => p.id === (claim?.policy_id ?? d.item.policy_id))
  const items = Array.isArray(task.payload?.items) ? task.payload.items as string[] : (claim?.gaps ?? []).map((g: Row) => g.item)
  const fromClient = d.messages.filter(m => m.side === 'client' && !m.rebuilt)
  const original = kind === 'forward_to_insurer' ? fromClient[fromClient.length - 1] ?? d.messages.find(m => m.side === 'client') ?? null : null
  const clientFiles = d.files.filter(f => fromClient.some(m => m.id === f.message_id))
  const attachments: Attachment[] = kind === 'forward_to_insurer' ? clientFiles.map(f => ({ filename: f.filename, mime_type: f.mime_type, storage_url: f.storage_url, message_id: f.message_id })) : []
  const subjectThread = d.threads.find(t => t.id === original?.thread_id)
  return {
    attachments,
    // A forward is a new email to the insurer, not a reply on the client's thread.
    threadId: kind === 'forward_to_insurer' ? null : thread?.id ?? null,
    f: {
      greetingName, clientName: d.company?.company_name ?? d.item.client_name ?? null, title: d.item.title,
      policyNumber: claim?.policy_number ?? d.item.policy_number ?? null, insurerName: claim?.insurer_name ?? d.item.insurer_name ?? null,
      insurerRef: claim?.insurer_ref ?? null, claimant: claim?.claimant ?? null, lossDate: claim?.loss_date ?? null, items,
      lastSent: lastTrs?.sent_at ?? d.item.waiting_since ?? null, expiry: policy?.end_date ?? task.payload?.expiry ?? null,
      className: policy?.class_of_insurance ?? policy?.product_line ?? null, threadSubject: thread?.subject ?? null,
      original: original ? { from: original.from, sent_at: original.sent_at, subject: subjectThread?.subject ?? null, text: latestText(original.text, 6000) } : null,
      files: (kind === 'forward_to_insurer' || kind === 'client_ack') ? clientFiles.map(f => f.filename) : [],
    },
  }
}

async function firstName(email: string): Promise<string | null> {
  const [person] = await sbTry<Row[]>(`contacts?email=ilike.${enc(email)}&select=first_name&limit=1`, [])
  return person?.first_name ?? null
}

export async function handleDrafter(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const kind = task.kind as DraftKind
  if (!KINDS.includes(kind)) { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  if (!task.work_item_id) { await skip(task.id, 'no work item'); return 'handled' }
  const d = await loadCaseData(task.work_item_id)
  if (!d) { await skip(task.id, 'work item gone'); return 'handled' }
  if (d.item.closed_at) { await skip(task.id, 'work item closed'); return 'handled' }
  if (await hasOpenDraft(d.item)) { await skip(task.id, 'item already holds an unsent draft'); return 'handled' }

  const side = partyOf(kind)
  const [claim] = d.item.case_type === 'claim' ? await sbTry<Row[]>(`claims?work_item_id=eq.${enc(d.item.id)}&select=*&limit=1`, []) : []
  if (kind === 'request_missing' && !(Array.isArray(task.payload?.items) ? task.payload.items : claim?.gaps ?? []).length) { await skip(task.id, 'nothing missing'); return 'handled' }

  const route = await routeSide(side, kind, d, claim, task.payload?.human as Row | undefined)
  if (!route.ok) {
    await askHuman(task.id, route.question, { work_item_id: d.item.id, kind, side })
    return 'handled'
  }
  const main = facts(kind, d, claim, await firstName(route.to[0]), task, side)
  const built = buildDraft(kind, main.f)

  const pairKind = pairFor(kind)
  let pair: { route: Route & { ok: true }; f: ReturnType<typeof facts> } | null = null
  if (pairKind) {
    const r = await routeSide('client', pairKind, d, claim)
    if (r.ok) pair = { route: r, f: facts(pairKind, d, claim, await firstName(r.to[0]), task, 'client') }
  }
  const pairId = pair ? randomUUID() : null
  const draftId = await storeDraft(d.item.id, { thread_id: main.threadId, to: route.to, cc: route.cc, subject: built.subject, body: built.body, kind, party: side, pair_id: pairId, attachments: main.attachments })
  let pairDraftId: string | null = null
  if (pair && pairKind) {
    const b = buildDraft(pairKind, pair.f.f)
    pairDraftId = await storeDraft(d.item.id, { thread_id: pair.f.threadId, to: pair.route.to, cc: pair.route.cc, subject: b.subject, body: b.body, kind: pairKind, party: 'client', pair_id: pairId }, { primary: false })
  }
  return { draft_id: draftId, pair_draft_id: pairDraftId, to: route.to, basis: route.basis, pair_to: pair?.route.to ?? null }
}
