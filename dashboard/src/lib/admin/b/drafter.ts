/**
 * The drafter: one job, write the email a task asks for and put it on the work item for approval.
 *
 * Kinds: request_missing, chase_insurer, chase_client, renewal_notice. Recipients come from the
 * recipient router; when it has nobody, a person is asked and nothing is drafted. An item that
 * already holds an unsent draft keeps it: a person may be editing it, or the case worker wrote a
 * better one. Nothing here sends.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { askHuman, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { buildDraft, type DraftKind } from './drafts'
import { routeRecipients, type Side } from './router'
import { loadCaseData, toCaseMail, scopedContacts, groupFacts, itemEvent, insurerLastHandler, type CaseData } from './data'

type Row = Record<string, any>
const KINDS: DraftKind[] = ['request_missing', 'chase_insurer', 'chase_client', 'renewal_notice']

export async function storeDraft(workItemId: string, d: { thread_id: string | null; to: string[]; cc: string[]; subject: string; body: string; kind: string }): Promise<string> {
  const [contact] = await sbTry<Row[]>(`contacts?email=ilike.${enc(d.to[0])}&select=id&limit=1`, [])
  const [draft] = await sb<Row[]>('ai_drafts', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      contact_id: contact?.id ?? null, thread_id: d.thread_id, channel: 'email', email_type: 'CASE_WORK', status: 'pending',
      generated_by: 'template', to_email: d.to.join(', '), cc: d.cc.join(', ') || null, subject: d.subject, body: d.body,
      attachments: [], work_item_id: workItemId, context_used: { agent: 'drafter', kind: d.kind },
    }),
  })
  await sb(`work_items?id=eq.${enc(workItemId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: draft.id, updated_at: new Date().toISOString() }) })
  await itemEvent(workItemId, 'draft', 'drafter', { kind: d.kind, draft_id: draft.id })
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

export async function handleDrafter(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const kind = task.kind as DraftKind
  if (!KINDS.includes(kind)) { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  if (!task.work_item_id) { await skip(task.id, 'no work item'); return 'handled' }
  const d = await loadCaseData(task.work_item_id)
  if (!d) { await skip(task.id, 'work item gone'); return 'handled' }
  if (d.item.closed_at) { await skip(task.id, 'work item closed'); return 'handled' }
  if (await hasOpenDraft(d.item)) { await skip(task.id, 'item already holds an unsent draft'); return 'handled' }

  const side: Side = kind === 'chase_insurer' ? 'insurer' : 'client'
  const scope = scopeFor(kind, d)
  const [claim] = d.item.case_type === 'claim' ? await sbTry<Row[]>(`claims?work_item_id=eq.${enc(d.item.id)}&select=*&limit=1`, []) : []
  const facts = side === 'insurer' ? await groupFacts(d.item.company_id) : []
  const desk = facts.filter(f => /desk|claims\.contact|insurer\.contact/.test(f.key) && /@/.test(f.value)).map(f => String(f.value))
  const human = task.payload?.human as Row | undefined
  const company = d.item.company_id as string | null
  const parent = d.company?.parent_id as string | null | undefined

  const route = human?.to
    ? { ok: true as const, to: String(human.to).split(/[,;]\s*/).filter(Boolean), cc: String(human.cc ?? '').split(/[,;]\s*/).filter(Boolean), basis: `chosen by ${human.by}` }
    : routeRecipients({
      side, scope, messages: toCaseMail(d),
      clientContacts: await scopedContacts(company), groupContacts: parent ? await scopedContacts(parent) : [],
      insurerDesk: desk, insurerLastHandler: side === 'insurer' && !desk.length ? await insurerLastHandler(d.item.insurer_name ?? claim?.insurer_name, scope) : null, insurerDomains: d.insurerDomains, departed: d.departed,
      owner: d.item.owner_email ?? null,
    })
  if (!route.ok) {
    await askHuman(task.id, route.question, { work_item_id: d.item.id, kind, side })
    return 'handled'
  }

  const [person] = await sbTry<Row[]>(`contacts?email=ilike.${enc(route.to[0])}&select=first_name&limit=1`, [])
  const sideThreads = d.threads.filter(t => t.side === side).sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  const thread = sideThreads[0] ?? d.threads[0] ?? null
  const lastTrs = [...d.messages].reverse().find(m => m.side === 'trs' && !m.rebuilt)
  const policy = d.policies.find(p => p.id === (claim?.policy_id ?? d.item.policy_id))
  const items = Array.isArray(task.payload?.items) ? task.payload.items as string[] : (claim?.gaps ?? []).map((g: Row) => g.item)
  if (kind === 'request_missing' && !items.length) { await skip(task.id, 'nothing missing'); return 'handled' }

  const { subject, body } = buildDraft(kind, {
    greetingName: person?.first_name ?? null, clientName: d.company?.company_name ?? d.item.client_name ?? null, title: d.item.title,
    policyNumber: claim?.policy_number ?? d.item.policy_number ?? null, insurerName: claim?.insurer_name ?? d.item.insurer_name ?? null,
    insurerRef: claim?.insurer_ref ?? null, claimant: claim?.claimant ?? null, lossDate: claim?.loss_date ?? null, items,
    lastSent: lastTrs?.sent_at ?? d.item.waiting_since ?? null, expiry: policy?.end_date ?? task.payload?.expiry ?? null,
    className: policy?.class_of_insurance ?? policy?.product_line ?? null, threadSubject: thread?.subject ?? null,
  })
  const draftId = await storeDraft(d.item.id, { thread_id: thread?.id ?? null, to: route.to, cc: route.cc, subject, body, kind })
  return { draft_id: draftId, to: route.to, basis: route.basis }
}
