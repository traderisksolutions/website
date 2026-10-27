/**
 * One request draft per policy line is shared by every dispatch of that line in its round.
 * At send time the shared draft fans out: one ai_drafts clone per dispatch, carrying the text
 * the reviewer approved, so the send route can mail each insurer and markSent can file each
 * Gmail thread against its own dispatch. Pure shaping; the writes live in workflow.fanoutDraft.
 */
import type { PlacementDispatch } from './types'

export type FanoutText = { subject: string; body: string }
export type FanoutSource = { id: string; contact_id: string; thread_id: string | null; cc?: string[] | null }
export type CloneRow = {
  contact_id: string; thread_id: string | null; channel: 'email'; to_email: string; subject: string; body: string
  status: 'pending'; generated_by: 'placement'; email_type: 'PLACEMENT_REQUEST'; cc: string[]
}
export type CloneTarget = Pick<PlacementDispatch, 'id' | 'to_email' | 'insurer_contact_id' | 'insurer_name'>

/** The clone rows, one per dispatch and in dispatch order, so the inserted rows line up with `dispatches`. */
export function cloneRows(source: FanoutSource, dispatches: CloneTarget[], text: FanoutText): CloneRow[] {
  const subject = text.subject.trim()
  const body = text.body.replace(/\r\n/g, '\n').trim()
  return dispatches.map(d => ({
    contact_id: d.insurer_contact_id ?? source.contact_id,
    thread_id: source.thread_id,
    channel: 'email',
    to_email: d.to_email.trim().toLowerCase(),
    subject,
    body,
    status: 'pending',
    generated_by: 'placement',
    email_type: 'PLACEMENT_REQUEST',
    cc: Array.isArray(source.cc) ? source.cc : [],
  }))
}

export type FanoutClone = { draft_id: string; dispatch_id: string; to_email: string; insurer_name: string }

/** Pairs each inserted clone with the dispatch it was shaped from (same order as cloneRows). */
export function pairClones(dispatches: CloneTarget[], inserted: { id: string }[]): FanoutClone[] {
  if (inserted.length !== dispatches.length) throw new Error(`Fan-out wrote ${inserted.length} drafts for ${dispatches.length} dispatches`)
  return dispatches.map((d, i) => ({ draft_id: inserted[i].id, dispatch_id: d.id, to_email: d.to_email, insurer_name: d.insurer_name }))
}
