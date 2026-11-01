/**
 * The payloads Phase A agents put on agent_tasks for other agents. One type per (agent, kind),
 * so the receiving agent reads a known shape.
 */
import type { HistoryMessage } from './history'
import type { JoinedBy } from './match'

export type Gap = { item: string; basis: string }

/** claims · open_midway — a claim TRS has no record of, read from a forward or quoted history. */
export type OpenMidwayPayload = {
  thread_id: string
  message_id: string
  company_id: string | null
  opened_mode: 'from_forward' | 'midway'
  rebuilt_ids: string[]
  refs: string[]
  gaps: Gap[]
  /** Outside addresses on the rebuilt messages who never copied TRS. */
  left_off_trs: string[]
}

/** claims · case_mail — new mail (or a forward) joined to an open claim case. */
export type ClaimMailPayload = {
  work_item_id: string
  claim_id: string | null
  thread_id: string
  message_id: string
  joined_by: JoinedBy
  rebuilt_ids: string[]
}

/** intake · read_case — the case worker reads one client; debounced per company. */
export type ReadCasePayload = {
  company_id: string
  thread_ids: string[]
  message_ids: string[]
  opened_mode: 'normal' | 'from_forward' | 'midway'
  gaps: Gap[]
}

/** resolver · thread — find the client for a thread nobody has filed. */
export type ResolveThreadPayload = { thread_id: string; sender: string | null; subject: string | null; guess?: string | null }

/** document_clerk · attachments — file a message's attachments into the data room. */
export type AttachmentsPayload = { message_id: string }

/** policy_reader · document — read a filed cover document into facts. */
export type PolicyDocumentPayload = { document_id: string }

/** knowledge_keeper · record_facts / seed_company / read_message */
export type FactInput = {
  company_id: string
  policy_id?: string | null
  topic: string
  key: string
  value: string
  source_kind: 'email' | 'attachment' | 'policy' | 'document' | 'staff'
  source_id?: string | null
  source_date?: string | null
  quote?: string | null
  confidence?: 'high' | 'medium' | 'low'
}
export type RecordFactsPayload = { facts: FactInput[] }
export type SeedCompanyPayload = { company_id: string }
export type ReadMessagePayload = { message_id: string; company_id: string }

export type RebuiltRow = HistoryMessage & { id?: string }
