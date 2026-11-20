/**
 * The File button (docs/filing.md). A person files one email attachment or one data-room document:
 * the dashboard suggests the company, policy and type by rules, the person confirms, and the
 * document lands in its folder of the one Drive tree (tree.ts) with its record (policy_documents).
 *
 * No model is called: the type comes from the file name, the company from the thread, the policy
 * from the placement the thread belongs to or the client's one live policy. The person decides.
 * A file on a colleague's private thread is refused, as its thread is (mail/visibility).
 */
import * as store from '@/lib/documents/store'
import { db, rows } from '@/lib/db/client'
import { classifyByName, isDocType } from '@/lib/documents/taxonomy'
import { groupFolderName } from '@/lib/documents/drive'
import { updateDocument } from '@/lib/documents/ingest'
import { threadVisibleTo, PRIVATE_THREAD } from '@/lib/mail/visibility-server'
import { lineName } from '@/lib/renewals/lines'
import { filingPath, lineOfFiling, planYearOf } from './tree'
import { todaySGT } from '@/lib/sgt-time'

export class FilingError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export type FilingPolicyOption = {
  id: string; label: string; insurer: string | null; policy_number: string | null; start_date: string | null; end_date: string | null
  line_code: string; line_name: string; plan_year: string | null; live: boolean
}

export type FilingSuggestion = {
  file: { name: string; size: number | null; mime: string | null }
  document: { id: string; status: string; drive_url: string | null; filed_by: string | null; filed_at: string | null } | null
  company: { id: string; name: string } | null
  group: string | null
  policies: FilingPolicyOption[]
  doc_type: string
  policy_id: string | null
  path: string[] | null
}

type Policy = Awaited<ReturnType<typeof store.companyPolicies>>[number]

const isLive = (p: Policy, today: string) => (!p.start_date || p.start_date <= today) && (!p.end_date || p.end_date >= today)

function option(p: Policy, today: string): FilingPolicyOption {
  const line = lineOfFiling(p)
  return {
    id: p.id, label: p.label || p.class_of_insurance || 'Policy', insurer: p.insurer, policy_number: p.policy_number,
    start_date: p.start_date, end_date: p.end_date, line_code: line, line_name: lineName(line) ?? 'Other',
    plan_year: planYearOf(p.start_date), live: isLive(p, today),
  }
}

/** Newest first, live before the rest. */
export function policyOptions(rows: Policy[]): FilingPolicyOption[] {
  const today = todaySGT()
  return rows.map(p => option(p, today)).sort((a, b) => Number(b.live) - Number(a.live) || (b.start_date ?? '').localeCompare(a.start_date ?? ''))
}

async function clientOfThread(threadId: string | null): Promise<string | null> {
  if (!threadId) return null
  const [r] = await rows('Thread client', db().from('thread_insurers').select('client_company_id').eq('thread_id', threadId).not('client_company_id', 'is', null).limit(1))
  return r?.client_company_id ?? null
}

/** What the file is and where it came from: an attachment or a data-room document. */
async function source(ref: { attachmentId?: string; documentId?: string }, viewer: string) {
  const doc = ref.documentId ? await store.documentById(ref.documentId) : ref.attachmentId ? await store.documentForAttachment(ref.attachmentId) : null
  if (ref.documentId && !doc) throw new FilingError('Document not found', 404)
  const att = ref.attachmentId ? await store.attachment(ref.attachmentId) : null
  if (ref.attachmentId && !att) throw new FilingError('Attachment not found', 404)
  const threadId = doc?.thread_id ?? att?.thread_id ?? null
  if (threadId && !(await threadVisibleTo(threadId, viewer))) throw new FilingError(PRIVATE_THREAD.error, 403)
  return { doc, att, threadId }
}

export async function suggest(ref: { attachmentId?: string; documentId?: string; companyId?: string }, viewer: string): Promise<FilingSuggestion> {
  const { doc, att, threadId } = await source(ref, viewer)
  const name = doc?.filename ?? att?.filename ?? 'File'
  const [thread, placed, about] = await Promise.all([threadId ? store.thread(threadId) : null, store.placementThreadPolicy(threadId), clientOfThread(threadId)])
  // A thread filed under the insurer or a partner is about a client (crm/client-link.ts): that client first.
  const companyId = ref.companyId ?? placed?.company_id ?? about ?? doc?.company_id ?? thread?.company_id ?? null
  // Never suggest an insurer or a partner as the client: the person chooses (35% of filed documents
  // sat under one on 21 Nov 2026). Chosen by hand (?company=) it stands.
  const kind = companyId && !ref.companyId ? (await rows('Company kind', db().from('companies').select('kind').eq('id', companyId).limit(1)))[0]?.kind ?? null : null
  const company = companyId && kind !== 'insurer' && kind !== 'partner' ? await store.company(companyId) : null
  const held = company ? await store.companyPolicies(company.id) : []
  const policies = policyOptions(held)
  const docType = doc && doc.status !== 'ignored' && isDocType(doc.doc_type) && doc.doc_type !== 'other' ? doc.doc_type : classifyByName(name) ?? 'other'
  const live = policies.filter(p => p.live)
  const policyId = [doc?.policy_id, placed?.policy_id].find(id => id && policies.some(p => p.id === id)) ?? (live.length === 1 ? live[0].id : null)
  const group = company ? await groupFolderName(company.id, company.name) : null
  const chosen = held.find(p => p.id === policyId) ?? null
  return {
    file: { name, size: doc?.size_bytes ?? att?.size_bytes ?? null, mime: doc?.mime_type ?? att?.mime_type ?? null },
    document: doc ? { id: doc.id, status: doc.status, drive_url: doc.drive_url, filed_by: doc.filed_by ?? null, filed_at: doc.filed_at ?? null } : null,
    company, group, policies, doc_type: docType, policy_id: policyId,
    path: group ? filingPath({ group, policy: chosen, docType }) : null,
  }
}

/** Files it: the record first (one per attachment), then Drive. Returns the record. */
export async function fileIt(b: { attachmentId?: string; documentId?: string; companyId: string; policyId: string | null; docType: string }, actor: string) {
  if (!isDocType(b.docType)) throw new FilingError('Choose the type of document.')
  const company = await store.company(b.companyId)
  if (!company) throw new FilingError('Choose the company.', 404)
  if (b.policyId) {
    const p = await store.policy(b.policyId)
    if (!p) throw new FilingError('Policy not found', 404)
    if (p.company_id !== company.id) throw new FilingError('That policy belongs to another company.', 409)
  }
  const { doc, att } = await source(b, actor)
  let row = doc
  if (!row && att) {
    const msg = await store.message(att.message_id)
    row = await store.insertDocument({
      filename: att.filename, mime_type: att.mime_type, size_bytes: att.size_bytes, source: 'email',
      email_attachment_id: att.id, thread_id: att.thread_id, message_id: att.message_id,
      from_address: msg?.from_address ?? null, received_at: msg?.sent_at ?? att.created_at,
      company_id: company.id, policy_id: b.policyId, doc_type: b.docType, classified_by: 'broker', confidence: 1, needs_review: false, status: 'unfiled',
    }) ?? await store.documentForAttachment(att.id)
  }
  if (!row) throw new FilingError('Nothing to file.', 404)
  const next = await updateDocument(row.id, {
    company_id: company.id, policy_id: b.policyId, doc_type: b.docType, ...(row.status === 'ignored' ? { status: 'unfiled' as const } : {}),
  }, actor)
  if (!next) throw new FilingError('Document not found', 404)
  if (next.status === 'failed') throw new FilingError(`Drive refused the file: ${next.error ?? 'unknown error'}`, 502)
  return next
}
