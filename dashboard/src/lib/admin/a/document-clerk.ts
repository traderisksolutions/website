/**
 * Document clerk: files a message's attachments into the data room through the existing
 * pipeline (src/lib/documents/ingest.ts — classify, match a policy, Drive). Nothing new about
 * filing; this agent only runs it per message and hands cover documents to the policy reader.
 *
 *   document_clerk · attachments   { message_id }
 */
import { sbTry, enc } from '@/lib/crm/db'
import { ingestAttachment } from '@/lib/documents/ingest'
import { applyMoneyRead, companyPolicies, NOTE_TYPES, TERMS_TYPES, CLAIM_TYPES } from '@/lib/documents/money-store'
import { enqueue, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import type { AttachmentsPayload } from './handoffs'

/** Documents whose fields describe the cover itself. */
export const COVER_DOC_TYPES = new Set(['policy_schedule', 'cover_note', 'endorsement', 'certificate', 'renewal_notice', 'benefit_summary', 'insurer_debit_note'])

export async function fileAttachments(task: AgentTask) {
  const { message_id } = task.payload as AttachmentsPayload
  const atts = await sbTry<{ id: string }[]>(`email_attachments?message_id=eq.${enc(message_id)}&select=id`, [])
  if (!atts.length) {
    // Attachments are saved just after the message; a first run can be early. Retry, then let go.
    if (task.attempts < task.max_attempts) throw new Error('attachments not stored yet')
    await skip(task.id, 'no attachments stored for this message')
    return 'handled' as const
  }
  let filed = 0, cover = 0
  for (const a of atts) {
    const doc = await ingestAttachment(a.id)
    if (!doc || doc.status === 'ignored') continue
    filed++
    // Money data: insurer notes, schedules and claim letters go into the policy ledger on arrival.
    if (doc.company_id && (NOTE_TYPES.has(doc.doc_type) || TERMS_TYPES.has(doc.doc_type) || CLAIM_TYPES.has(doc.doc_type))) {
      try {
        const [att] = await sbTry<{ parsed_text: string | null }[]>(`email_attachments?id=eq.${enc(a.id)}&select=parsed_text&limit=1`, [])
        await applyMoneyRead(doc as any, att?.parsed_text, await companyPolicies(doc.company_id), true)
      } catch (e) { console.warn('[document_clerk] money read failed (non-fatal):', e instanceof Error ? e.message : e) }
    }
    if (COVER_DOC_TYPES.has(doc.doc_type) && doc.company_id) {
      cover++
      await enqueue({ agent: 'policy_reader', kind: 'document', idem_key: `policydoc:${doc.id}`, created_by_agent: 'document_clerk', company_id: doc.company_id, policy_id: doc.policy_id, message_id, payload: { document_id: doc.id } })
    }
  }
  return { attachments: atts.length, filed, cover }
}
