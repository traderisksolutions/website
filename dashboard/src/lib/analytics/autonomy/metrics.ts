/**
 * The autonomy share, from the per-message rows. Pure.
 *
 *   share        agent-originated messages (approved or auto) over all outgoing messages, with
 *                internal mail and the excluded mailboxes left out of both sides;
 *   effort share the same, weighted by each message's effort (own words plus files);
 *   unedited     among agent-originated messages, the share sent with less than a tenth changed.
 *
 * Weeks run Monday to Sunday in Singapore time.
 */
import type { Origin } from './origin'
import { isUnedited } from './origin'
import type { Tier, WorkClass } from './classify'

export type OriginRow = {
  message_id: string; sent_at: string; sender: string; thread_id: string | null; company_id: string | null; company_name?: string | null
  origin: Origin; draft_id: string | null; edit_share: number | null
  work_class: WorkClass; work_sub: string; tier: Tier; side: string; words: number; attachments: number; effort: number
  side_channel?: boolean
}

export type Bucket = {
  key: string; label: string
  messages: number; agent: number; hand: number; auto: number
  effort: number; agentEffort: number
  share: number; effortShare: number
  unedited: number; uneditedRate: number | null
  personOnly?: boolean
}

export const TARGET_SHARE = 0.8
export const WEEK_MS = 7 * 86_400_000

/** The Monday (SGT) that starts the week a timestamp falls in, as YYYY-MM-DD. */
export function weekOf(iso: string): string {
  const t = new Date(Date.parse(iso) + 8 * 3_600_000)
  const day = (t.getUTCDay() + 6) % 7
  const monday = new Date(t.getTime() - day * 86_400_000)
  return monday.toISOString().slice(0, 10)
}

const counted = (r: OriginRow) => r.tier !== 'excluded' && r.work_class !== 'internal'
const isAgent = (r: OriginRow) => r.origin === 'agent_approved' || r.origin === 'agent_auto'

function build(key: string, label: string, rows: OriginRow[]): Bucket {
  const b: Bucket = { key, label, messages: 0, agent: 0, hand: 0, auto: 0, effort: 0, agentEffort: 0, share: 0, effortShare: 0, unedited: 0, uneditedRate: null }
  for (const r of rows) {
    b.messages++; b.effort += r.effort
    if (isAgent(r)) { b.agent++; b.agentEffort += r.effort; if (r.origin === 'agent_auto') b.auto++; if (isUnedited(r.edit_share)) b.unedited++ }
    else b.hand++
  }
  b.share = b.messages ? b.agent / b.messages : 0
  b.effortShare = b.effort ? b.agentEffort / b.effort : 0
  b.uneditedRate = b.agent ? b.unedited / b.agent : null
  return b
}

function group(rows: OriginRow[], keyOf: (r: OriginRow) => string, labelOf: (k: string, r: OriginRow) => string): Bucket[] {
  const by = new Map<string, OriginRow[]>()
  for (const r of rows) { const k = keyOf(r); by.set(k, [...(by.get(k) ?? []), r]) }
  return Array.from(by.entries()).map(([k, rs]) => build(k, labelOf(k, rs[0]), rs))
}

export type Metrics = {
  total: Bucket
  thisWeek: Bucket | null
  byWeek: Bucket[]
  byClass: Bucket[]
  bySender: Bucket[]
  byClient: Bucket[]
  excluded: number
}

export function metrics(all: OriginRow[], opts: { now?: string } = {}): Metrics {
  const rows = all.filter(counted)
  const byWeek = group(rows, r => weekOf(r.sent_at), k => k).sort((a, b) => a.key.localeCompare(b.key))
  const byClass = group(rows, r => r.work_class, k => k).sort((a, b) => b.messages - a.messages)
  for (const b of byClass) b.personOnly = rows.filter(r => r.work_class === b.key).every(r => r.tier === 'person')
  const bySender = group(rows, r => r.sender, k => k).sort((a, b) => b.messages - a.messages)
  const byClient = group(rows.filter(r => r.company_id), r => r.company_id!, (k, r) => r.company_name ?? k).sort((a, b) => b.messages - a.messages).slice(0, 50)
  const thisKey = weekOf(opts.now ?? new Date().toISOString())
  return { total: build('all', 'All', rows), thisWeek: byWeek.find(b => b.key === thisKey) ?? null, byWeek, byClass, bySender, byClient, excluded: all.length - rows.length }
}
