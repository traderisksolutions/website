/**
 * A client row's substance on Today (20 Nov 2026 design): renewal and days, current insurer and
 * premium, stage, who the row waits on, documents held and missing, each insurer's status, the
 * last five dated events, and links. Code computes all of it from records; nothing here comes
 * from a model. Pure and browser-safe; the reads are in substance-server.ts.
 */
import { classifyByName, dataRoomStatus, docLabel, isNoise } from '@/lib/documents/taxonomy'
import type { DeskPremium, DeskThread } from './desk'

const DAY = 86_400_000
const days = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY)

export type RowFacts = {
  renews: { date: string; days: number; policyId: string; policyNumber: string | null; line: string | null } | null
  insurer: string | null
  premium: DeskPremium[]
  stage: string | null
}

export type FactPolicy = { id: string; company_id: string; end_date: string | null; insurer: string | null; class_of_insurance: string | null; policy_number: string | null; lifecycle: string | null }

/** The policy renewing next: the live policy ending soonest from 30 days ago on. */
export function nextRenewal(policies: readonly FactPolicy[], today: string): FactPolicy | null {
  const from = new Date(Date.parse(today) - 30 * DAY).toISOString().slice(0, 10)
  return [...policies].filter(p => p.end_date && p.end_date.slice(0, 10) >= from)
    .sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))[0] ?? null
}

export function renewalFact(p: FactPolicy | null, today: string): RowFacts['renews'] {
  if (!p?.end_date) return null
  return { date: p.end_date.slice(0, 10), days: days(today, p.end_date), policyId: p.id, policyNumber: p.policy_number, line: p.class_of_insurance }
}

export type WaitingOn = { who: 'TRS' | 'Client' | 'Insurer'; since: string | null; threadId: string }

/**
 * Whom the row waits on, by the who-owes rule (src/lib/crm/waiting-on.ts): on the thread with the
 * latest message, TRS when the other side wrote last, else the side TRS wrote to.
 */
export function waitingOnRow(threads: readonly Pick<DeskThread, 'threadId' | 'lastAt' | 'lastInbound' | 'side'>[]): WaitingOn | null {
  const t = [...threads].filter(x => x.lastAt).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))[0]
  if (!t) return null
  return { who: t.lastInbound ? 'TRS' : t.side === 'insurer' ? 'Insurer' : 'Client', since: t.lastAt, threadId: t.threadId }
}

// ── Insurers ─────────────────────────────────────────────────────────────────────────────────────

export type Dispatch = { insurer_name: string; status: string; sent_at: string | null; last_inbound_at: string | null; created_at: string; thread_id: string | null; label?: string | null }
export type InsurerRow = { insurer: string; status: string; since: string | null; days: number | null; threadId: string | null; waiting: boolean }

const DISPATCH_WORD: Record<string, string> = {
  drafted: 'Request drafted', sent: 'Asked', acknowledged: 'Acknowledged', info_requested: 'Asked for information',
  quoted: 'Quoted', declined: 'Declined', expired: 'Quote expired', withdrawn: 'Withdrawn',
}

/** Each insurer's latest request on the client's open placements, with days since it moved. */
export function insurerRows(dispatches: readonly Dispatch[], today: string): InsurerRow[] {
  const latest = new Map<string, Dispatch>()
  for (const d of dispatches) {
    const k = d.insurer_name.toLowerCase()
    const cur = latest.get(k)
    if (!cur || d.created_at > cur.created_at) latest.set(k, d)
  }
  return [...latest.values()].filter(d => d.status !== 'withdrawn').map(d => {
    const since = d.status === 'sent' ? d.sent_at : d.last_inbound_at ?? d.sent_at ?? d.created_at
    return {
      insurer: d.insurer_name, status: DISPATCH_WORD[d.status] ?? d.status, since: since ?? null,
      days: since ? days(since, today) : null, threadId: d.thread_id, waiting: d.status === 'sent' || d.status === 'acknowledged',
    }
  }).sort((a, b) => Number(b.waiting) - Number(a.waiting) || a.insurer.localeCompare(b.insurer))
}

// ── Documents ────────────────────────────────────────────────────────────────────────────────────

export type DocFile = { filename: string; mime_type?: string | null; at: string | null; threadId: string | null; id?: string | null; docType?: string | null; canOpen?: boolean }
export type DocRow = { label: string; state: 'held' | 'missing'; filename: string | null; at: string | null; threadId: string | null; attachmentId: string | null; canOpen: boolean }
export type DocPolicy = { lifecycle: string; is_eb: boolean; product_line: string | null }

/** The documents that matter for a renewal, first: what a placement asks for. */
const KEY_TYPES = ['member_list', 'policy_schedule', 'benefit_summary', 'claims_history', 'proposal_form', 'quotation', 'renewal_notice', 'insurer_debit_note', 'trs_debit_note']
const CENSUS = /census|name.?list|member.?list|employee.?(list|data)|headcount/i

/**
 * Documents held, by type (the data room's type when filed, else the file name), newest per type,
 * and the ones the client's policies still need (taxonomy.ts requiredDocs) marked missing.
 */
export function documentRows(files: readonly DocFile[], policies: readonly DocPolicy[]): DocRow[] {
  const byType = new Map<string, DocFile>()
  for (const f of files) {
    if (isNoise(f.filename, f.mime_type)) continue
    const type = f.docType || (CENSUS.test(f.filename) ? 'member_list' : classifyByName(f.filename))
    if (!type || !KEY_TYPES.includes(type)) continue
    const cur = byType.get(type)
    if (!cur || String(f.at ?? '') > String(cur.at ?? '')) byType.set(type, f)
  }
  const held: DocRow[] = KEY_TYPES.filter(t => byType.has(t)).map(t => {
    const f = byType.get(t)!
    return { label: t === 'member_list' ? 'Census' : docLabel(t), state: 'held', filename: f.filename, at: f.at, threadId: f.threadId, attachmentId: f.id ?? null, canOpen: f.canOpen !== false }
  })
  const missing = new Map<string, string>()
  const types = [...byType.keys()]
  for (const p of policies) for (const m of dataRoomStatus(p, types).missing) if (!missing.has(m.slug)) missing.set(m.slug, m.slug === 'member_list' ? 'Census' : m.label)
  return [...held, ...[...missing.values()].map(label => ({ label, state: 'missing' as const, filename: null, at: null, threadId: null, attachmentId: null, canOpen: true }))]
}

// ── Timeline ─────────────────────────────────────────────────────────────────────────────────────

export type TimelineEvent = { at: string; who: string; what: string; threadId?: string | null }

/** The last `n` dated events, newest first; one event per thread and day. */
export function timeline(events: readonly TimelineEvent[], n = 5): TimelineEvent[] {
  const seen = new Set<string>()
  const out: TimelineEvent[] = []
  for (const e of [...events].filter(e => e.at).sort((a, b) => b.at.localeCompare(a.at))) {
    const k = `${e.threadId ?? e.what}|${e.at.slice(0, 10)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
    if (out.length >= n) break
  }
  return out
}
