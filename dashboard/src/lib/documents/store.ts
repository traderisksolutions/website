/**
 * Reads and writes for the data room. Every function is a thin PostgREST call; the rules live in
 * taxonomy.ts and classify.ts.
 */
import { enc, sb, sbTry } from '@/lib/crm/db'
import type { PolicyCandidate } from './classify'

export type PolicyDocument = {
  id: string
  company_id: string | null
  policy_id: string | null
  placement_line_id: string | null
  doc_type: string
  title: string | null
  filename: string
  mime_type: string | null
  size_bytes: number | null
  source: 'email' | 'upload' | 'generated'
  email_attachment_id: string | null
  thread_id: string | null
  message_id: string | null
  from_address: string | null
  received_at: string | null
  insurer_name: string | null
  policy_number: string | null
  period_from: string | null
  period_to: string | null
  premium_text: string | null
  class_of_insurance: string | null
  sha256: string | null
  drive_file_id: string | null
  drive_url: string | null
  status: 'unfiled' | 'filed' | 'failed' | 'ignored'
  classified_by: 'rule' | 'agent' | 'broker' | null
  confidence: number | null
  needs_review: boolean
  error: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type AttachmentRow = {
  id: string
  message_id: string
  thread_id: string
  filename: string
  mime_type: string | null
  size_bytes: number | null
  parsed_text: string | null
  gmail_attachment_id: string | null
  created_at: string
}

export type MessageRow = { id: string; gmail_message_id: string | null; from_address: string | null; subject: string | null; sent_at: string | null; direction: string | null }
export type ThreadRow = { id: string; company_id: string | null; subject: string | null }
export type CompanyRow = { id: string; name: string }

const DOC_COLS = '*'
const JSON_H = { 'Content-Type': 'application/json' }

export const attachment = async (id: string) =>
  (await sbTry<AttachmentRow[]>(`email_attachments?id=eq.${enc(id)}&select=id,message_id,thread_id,filename,mime_type,size_bytes,parsed_text,gmail_attachment_id,created_at&limit=1`, []))[0] ?? null

export const message = async (id: string) =>
  (await sbTry<MessageRow[]>(`email_messages?id=eq.${enc(id)}&select=id,gmail_message_id,from_address,subject,sent_at,direction&limit=1`, []))[0] ?? null

export const thread = async (id: string) =>
  (await sbTry<ThreadRow[]>(`email_threads?id=eq.${enc(id)}&select=id,company_id,subject&limit=1`, []))[0] ?? null

export async function company(id: string): Promise<CompanyRow | null> {
  const rows = await sbTry<{ id: string; company_name: string | null; name?: string | null }[]>(`companies?id=eq.${enc(id)}&select=id,company_name&limit=1`, [])
  const r = rows[0]
  return r ? { id: r.id, name: (r.company_name ?? '').trim() || 'Unnamed company' } : null
}

export const companyPolicies = (companyId: string) =>
  sbTry<(PolicyCandidate & { company_id: string; is_eb: boolean; product_line: string | null; drive_folder_url: string | null; premium: number | null; status: string | null })[]>(
    `policies?company_id=eq.${enc(companyId)}&select=id,company_id,policy_number,cover_note_no,insurer,class_of_insurance,label,start_date,end_date,lifecycle,is_eb,product_line,drive_folder_url,premium,status&order=start_date.desc.nullslast`, [])

export const policy = async (id: string) =>
  (await sbTry<(PolicyCandidate & { company_id: string | null; is_eb: boolean; product_line: string | null; drive_folder_url: string | null })[]>(
    `policies?id=eq.${enc(id)}&select=id,company_id,policy_number,cover_note_no,insurer,class_of_insurance,label,start_date,end_date,lifecycle,is_eb,product_line,drive_folder_url&limit=1`, []))[0] ?? null

export const documentById = async (id: string) =>
  (await sbTry<PolicyDocument[]>(`policy_documents?id=eq.${enc(id)}&select=${DOC_COLS}&limit=1`, []))[0] ?? null

export const documentForAttachment = async (attachmentId: string) =>
  (await sbTry<PolicyDocument[]>(`policy_documents?email_attachment_id=eq.${enc(attachmentId)}&select=${DOC_COLS}&limit=1`, []))[0] ?? null

export const companyDocuments = (companyId: string) =>
  sbTry<PolicyDocument[]>(`policy_documents?company_id=eq.${enc(companyId)}&status=neq.ignored&select=${DOC_COLS}&order=received_at.desc.nullslast&limit=2000`, [])

export const policyDocumentTypes = (policyIds: string[]) => policyIds.length === 0
  ? Promise.resolve([] as { policy_id: string; doc_type: string }[])
  : sbTry<{ policy_id: string; doc_type: string }[]>(`policy_documents?policy_id=in.(${policyIds.map(enc).join(',')})&status=neq.ignored&select=policy_id,doc_type`, [])

export async function insertDocument(row: Partial<PolicyDocument>): Promise<PolicyDocument | null> {
  const rows = await sb<PolicyDocument[]>(`policy_documents?on_conflict=email_attachment_id&select=${DOC_COLS}`, {
    method: 'POST', headers: { ...JSON_H, Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(row),
  })
  return rows[0] ?? null
}

export async function patchDocument(id: string, patch: Partial<PolicyDocument>): Promise<PolicyDocument | null> {
  const rows = await sb<PolicyDocument[]>(`policy_documents?id=eq.${enc(id)}&select=${DOC_COLS}`, {
    method: 'PATCH', headers: { ...JSON_H, Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  return rows[0] ?? null
}

export async function patchPolicyFolder(policyId: string, url: string): Promise<void> {
  await sb(`policies?id=eq.${enc(policyId)}`, { method: 'PATCH', headers: { ...JSON_H, Prefer: 'return=minimal' }, body: JSON.stringify({ drive_folder_url: url }) })
}

/** Attachments with no data-room row yet, oldest first: the catch-up queue. */
export async function unseenAttachments(limit: number, since?: string): Promise<AttachmentRow[]> {
  const seen = new Set((await sbTry<{ email_attachment_id: string }[]>(`policy_documents?email_attachment_id=not.is.null&select=email_attachment_id${since ? `&created_at=gte.${enc(since)}` : ''}&limit=20000`, [])).map(r => r.email_attachment_id))
  const rows = await sbTry<AttachmentRow[]>(`email_attachments?select=id,message_id,thread_id,filename,mime_type,size_bytes,parsed_text,gmail_attachment_id,created_at${since ? `&created_at=gte.${enc(since)}` : ''}&order=created_at.asc&limit=20000`, [])
  return rows.filter(r => !seen.has(r.id)).slice(0, limit)
}

export const unfiledDocuments = (limit: number) =>
  sbTry<PolicyDocument[]>(`policy_documents?status=in.(unfiled,failed)&company_id=not.is.null&or=(error.is.null,error.not.ilike.*no%20longer%20on%20the%20Gmail*)&select=${DOC_COLS}&order=status.desc,created_at.desc&limit=${limit}`, [])

/** A filed document of the same company with the same bytes, if any. */
export const sameBytes = async (companyId: string, sha: string, exceptId: string) =>
  (await sbTry<{ id: string; policy_id: string | null; drive_url: string | null }[]>(`policy_documents?company_id=eq.${enc(companyId)}&sha256=eq.${enc(sha)}&status=eq.filed&id=neq.${enc(exceptId)}&select=id,policy_id,drive_url&limit=1`, []))[0] ?? null

/** Documents with no company whose thread has since been matched to one. */
export async function orphansWithCompany(limit: number): Promise<{ id: string; company_id: string }[]> {
  const orphans = await sbTry<{ id: string; thread_id: string | null }[]>(`policy_documents?company_id=is.null&thread_id=not.is.null&status=neq.ignored&select=id,thread_id&limit=${limit}`, [])
  const threadIds = [...new Set(orphans.map(o => o.thread_id!))]
  if (threadIds.length === 0) return []
  const threads = await sbTry<{ id: string; company_id: string | null }[]>(`email_threads?id=in.(${threadIds.map(enc).join(',')})&company_id=not.is.null&select=id,company_id`, [])
  const co = new Map(threads.map(t => [t.id, t.company_id!]))
  return orphans.flatMap(o => co.get(o.thread_id!) ? [{ id: o.id, company_id: co.get(o.thread_id!)! }] : [])
}
