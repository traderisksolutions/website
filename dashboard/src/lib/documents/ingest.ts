/**
 * Every document into the data room, once:
 *
 *   email attachment ─┐
 *   broker upload ────┼─→ classify (rules, then the agent) → match a policy → row → Drive
 *   TRS debit note ───┘
 *
 * Idempotent per attachment (unique email_attachment_id). A Drive failure leaves the row 'failed'
 * with the error, and the catch-up cron files it again. Nothing here sends anything.
 */
import { createHash } from 'node:crypto'
import { logError } from '@/lib/error-log'
import { isNoise, classifyByName } from './taxonomy'
import { matchPolicy, readDocument, type DocRead } from './classify'
import { attachmentBytes, fileToDrive, moveDriveFile } from './drive'
import * as store from './store'
import type { PolicyDocument } from './store'

const needsReview = (r: DocRead, policyId: string | null) => !policyId || r.confidence < 0.6

/** One email attachment into the data room. Returns the row (existing or new). */
export async function ingestAttachment(attachmentId: string, opts: { file?: boolean; bytes?: Buffer } = {}): Promise<PolicyDocument | null> {
  const existing = await store.documentForAttachment(attachmentId)
  if (existing) return existing
  const att = await store.attachment(attachmentId)
  if (!att) return null
  const [msg, thread, placed] = await Promise.all([store.message(att.message_id), store.thread(att.thread_id), store.placementThreadPolicy(att.thread_id)])

  const base: Partial<PolicyDocument> = {
    filename: att.filename, mime_type: att.mime_type, size_bytes: att.size_bytes, source: 'email',
    email_attachment_id: att.id, thread_id: att.thread_id, message_id: att.message_id,
    from_address: msg?.from_address ?? null, received_at: msg?.sent_at ?? att.created_at,
    // An insurer's reply on a request thread belongs to the client, even when the thread is filed under the insurer.
    company_id: placed?.company_id ?? thread?.company_id ?? null,
  }
  if (isNoise(att.filename, att.mime_type)) return store.insertDocument({ ...base, doc_type: 'other', status: 'ignored', classified_by: 'rule' })

  const read = await readDocument({ filename: att.filename, text: att.parsed_text, subject: msg?.subject ?? thread?.subject, from: msg?.from_address, documentId: att.id })
  const policies = base.company_id ? await store.companyPolicies(base.company_id) : []
  const policyId = placed?.policy_id ?? matchPolicy(read, policies)
  const doc = await store.insertDocument({
    ...base, policy_id: policyId, doc_type: read.doc_type, title: read.title, insurer_name: read.insurer_name, policy_number: read.policy_number,
    period_from: read.period_from, period_to: read.period_to, premium_text: read.premium_text, class_of_insurance: read.class_of_insurance,
    classified_by: read.classified_by, confidence: read.confidence, needs_review: needsReview(read, policyId), status: 'unfiled',
  })
  if (doc && opts.file !== false && doc.company_id) return fileDocument(doc, opts.bytes)
  return doc
}

/** Files (or re-files) a row in Drive. Bytes come from the caller (upload) or from Gmail. */
export async function fileDocument(doc: PolicyDocument, bytes?: Buffer): Promise<PolicyDocument> {
  if (!doc.company_id) return doc
  try {
    const company = await store.company(doc.company_id)
    if (!company) throw new Error('Company not found')
    let data = bytes
    if (!data) {
      const msg = doc.message_id ? await store.message(doc.message_id) : null
      if (!msg?.gmail_message_id) throw new Error('No Gmail message to fetch the file from')
      data = await attachmentBytes(msg.gmail_message_id, doc.filename)
    }
    // A reply chain re-attaches the same file: keep the first copy, mark the rest duplicates.
    const sha = createHash('sha256').update(data).digest('hex')
    const twin = await store.sameBytes(doc.company_id, sha, doc.id)
    if (twin) return (await store.patchDocument(doc.id, { sha256: sha, status: 'ignored', drive_url: twin.drive_url, error: `Same file as document ${twin.id}` })) ?? doc
    const policy = doc.policy_id ? await store.policy(doc.policy_id) : null
    const r = await fileToDrive({ companyName: company.name, policy, doc }, data)
    if (policy && r.policyFolderUrl) await store.patchPolicyFolder(policy.id, r.policyFolderUrl)
    return (await store.patchDocument(doc.id, { sha256: sha, drive_file_id: r.fileId, drive_url: r.url, status: 'filed', error: null, size_bytes: doc.size_bytes ?? data.length })) ?? doc
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    void logError({ source: 'gdrive', feature: 'data_room_file', message, metadata: { document_id: doc.id } })
    return (await store.patchDocument(doc.id, { status: 'failed', error: message.slice(0, 500) })) ?? doc
  }
}

/** A file a broker drops in (a PDF from WhatsApp, a scan): classified, matched, filed. */
export async function uploadDocument(u: {
  companyId: string; policyId?: string | null; filename: string; mimeType: string; bytes: Buffer; actor: string; text?: string | null; docType?: string | null
}): Promise<PolicyDocument | null> {
  const read = await readDocument({ filename: u.filename, text: u.text ?? null })
  const docType = u.docType ?? read.doc_type
  const policyId = u.policyId ?? matchPolicy(read, await store.companyPolicies(u.companyId))
  const doc = await store.insertDocument({
    company_id: u.companyId, policy_id: policyId, doc_type: docType, title: read.title, filename: u.filename, mime_type: u.mimeType,
    size_bytes: u.bytes.length, source: 'upload', received_at: new Date().toISOString(), insurer_name: read.insurer_name,
    policy_number: read.policy_number, period_from: read.period_from, period_to: read.period_to, premium_text: read.premium_text, class_of_insurance: read.class_of_insurance,
    classified_by: u.docType ? 'broker' : read.classified_by, confidence: u.docType ? 1 : read.confidence,
    needs_review: u.docType ? !policyId : needsReview(read, policyId), status: 'unfiled', uploaded_by: u.actor,
  })
  return doc ? fileDocument(doc, u.bytes) : null
}

/** A broker corrects the type or the policy; the Drive file moves with it. */
export async function updateDocument(id: string, patch: { doc_type?: string; policy_id?: string | null; company_id?: string; status?: 'ignored' | 'unfiled' }): Promise<PolicyDocument | null> {
  const doc = await store.documentById(id)
  if (!doc) return null
  const next = await store.patchDocument(id, { ...patch, classified_by: patch.doc_type ? 'broker' : doc.classified_by, needs_review: false })
  if (!next) return null
  if (next.status === 'ignored') return next
  if (!next.drive_file_id) return next.company_id ? fileDocument(next) : next
  const moved = patch.doc_type !== undefined || patch.policy_id !== undefined || patch.company_id !== undefined
  if (!moved || !next.company_id) return next
  try {
    const company = await store.company(next.company_id)
    const policy = next.policy_id ? await store.policy(next.policy_id) : null
    const r = await moveDriveFile(next.drive_file_id, { companyName: company?.name ?? 'Unnamed company', policy, doc: next })
    if (policy && r.policyFolderUrl) await store.patchPolicyFolder(policy.id, r.policyFolderUrl)
  } catch (e) {
    return store.patchDocument(id, { error: e instanceof Error ? e.message.slice(0, 500) : String(e) })
  }
  return next
}

/** The catch-up: unseen attachments in, failed files retried. Bounded per run. */
export async function catchUp(opts: { attachments: number; retries: number; since?: string; budgetMs?: number }): Promise<{ ingested: number; filed: number; failed: number }> {
  let ingested = 0, filed = 0, failed = 0
  for (const a of await store.unseenAttachments(opts.attachments, opts.since)) {
    const d = await ingestAttachment(a.id).catch(e => { void logError({ source: 'gemini', feature: 'data_room_ingest', message: String(e), metadata: { attachment_id: a.id } }); return null })
    if (!d) continue
    ingested++
    if (d.status === 'filed') filed++
    if (d.status === 'failed') failed++
  }
  // A thread matched to a company after its attachments arrived: the documents follow it.
  for (const o of await store.orphansWithCompany(opts.retries)) {
    const policies = await store.companyPolicies(o.company_id)
    const doc = await store.documentById(o.id)
    if (!doc) continue
    const policyId = matchPolicy(doc, policies)
    await store.patchDocument(o.id, { company_id: o.company_id, policy_id: policyId, needs_review: !policyId || doc.needs_review })
  }
  // File what is waiting, four at a time, until the run's time budget is spent. A backfill of a
  // few thousand documents finishes over a handful of daily runs.
  const deadline = Date.now() + (opts.budgetMs ?? 60_000)
  const queue = await store.unfiledDocuments(opts.retries)
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      if (Date.now() > deadline) return
      const d = queue.shift()
      if (!d) return
      const r = await fileDocument(d)
      if (r.status === 'filed') filed++
      else failed++
    }
  }))
  return { ingested, filed, failed }
}

export { classifyByName }
