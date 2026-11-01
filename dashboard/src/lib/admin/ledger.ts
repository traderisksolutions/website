/**
 * The company ledger: every event for a company group in date order, with links. The Knowledge
 * depositor is the only writer (src/lib/admin/k). Every other agent reads here and keeps a cursor
 * in agent_cursors, so it resumes where it stopped instead of re-reading the company.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'

export type LedgerKind = 'email_in' | 'email_out' | 'email_rebuilt' | 'document' | 'policy' | 'debit_note' | 'claim' | 'case' | 'fact' | 'note'
export type LedgerEntry = {
  id: string; seq: number; group_id: string | null; company_id: string | null; occurred_at: string
  kind: LedgerKind; title: string; summary: string | null; party: string | null; actor: string | null
  policy_id: string | null; work_item_id: string | null; thread_id: string | null
  links: { label: string; url: string }[]; source_table: string; source_id: string
}

/** Entries for a group after `sinceSeq`, oldest first. */
export async function readLedger(groupId: string, sinceSeq = 0, limit = 200): Promise<LedgerEntry[]> {
  return sbTry<LedgerEntry[]>(`company_ledger?group_id=eq.${enc(groupId)}&seq=gt.${sinceSeq}&order=seq.asc&limit=${limit}`, [])
}

/** The newest entries for a group (or one company), newest first — for people and for retrieval. */
export async function recentLedger(opts: { groupId?: string; companyId?: string; limit?: number; kinds?: LedgerKind[] }): Promise<LedgerEntry[]> {
  const f = [opts.groupId ? `group_id=eq.${enc(opts.groupId)}` : '', opts.companyId ? `company_id=eq.${enc(opts.companyId)}` : '', opts.kinds?.length ? `kind=in.(${opts.kinds.join(',')})` : ''].filter(Boolean).join('&')
  return sbTry<LedgerEntry[]>(`company_ledger?${f}&order=occurred_at.desc&limit=${opts.limit ?? 100}`, [])
}

export async function getCursor(agent: string, groupId: string): Promise<number> {
  const [c] = await sbTry<{ last_seq: number }[]>(`agent_cursors?agent=eq.${enc(agent)}&group_id=eq.${enc(groupId)}&select=last_seq`, [])
  return Number(c?.last_seq ?? 0)
}

export async function setCursor(agent: string, groupId: string, lastSeq: number): Promise<void> {
  await sb('agent_cursors?on_conflict=agent,group_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ agent, group_id: groupId, last_seq: lastSeq, updated_at: new Date().toISOString() }),
  })
}
