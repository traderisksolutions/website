/**
 * Pure shaping for the company ledger: what one source row becomes as a ledger entry. No I/O, so
 * the depositor and the backfill write identical rows and the tests read the rules directly.
 */
import { readHistory } from '@/lib/admin/a/history'
import { TRS_DOMAINS, PUBLIC_EMAIL_DOMAINS, emailDomain, bareEmail, isAutomated } from '@/lib/crm/db'
import type { LedgerKind } from '@/lib/admin/ledger'

type Row = Record<string, any>
export type Link = { label: string; url: string }
export type Party = 'client' | 'insurer' | 'internal' | 'partner' | 'tpa' | 'vendor' | 'automated' | 'other'

/** A ledger row before insert. company_id and group_id are filled per company it belongs to. */
export type LedgerDraft = {
  occurred_at: string; kind: LedgerKind; title: string; summary: string | null; party: string | null; actor: string | null
  policy_id: string | null; work_item_id: string | null; thread_id: string | null; links: Link[]; source_table: string; source_id: string
}

export const SUMMARY_MAX = 1500

/** The message's own text: quoted history and forwarded blocks removed, whitespace tidied, trimmed. */
export function ownText(body: string | null | undefined, subject?: string | null, max = SUMMARY_MAX): string | null {
  if (!body) return null
  let top: string
  try { top = readHistory(body, subject).top } catch { top = body }
  const t = top.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!t) return null
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Who a sender is, from our own domains and the domain → company-kind map. */
export function partyOf(sender: string | null | undefined, domainKind: Map<string, string>, threadKind?: string | null): Party {
  const email = bareEmail(sender)
  if (!email) return 'other'
  const d = emailDomain(email)
  if (TRS_DOMAINS.has(d)) return 'internal'
  if (isAutomated(email)) return 'automated'
  const k = domainKind.get(d)
  if (k === 'client' || k === 'insurer' || k === 'partner' || k === 'tpa' || k === 'vendor') return k
  // A personal address (or an unmapped domain) on a client's own thread is the client writing.
  return threadKind === 'client' && (PUBLIC_EMAIL_DOMAINS.has(d) || !k) ? 'client' : 'other'
}

export const threadLink = (threadId: string): Link => ({ label: 'Email thread', url: `/engagement?thread=${threadId}` })
export const gmailLink = (gmailId: string | null | undefined): Link | null =>
  gmailId ? { label: 'Gmail', url: `https://mail.google.com/mail/u/0/#all/${gmailId}` } : null
export const driveLink = (label: string, url: string | null | undefined): Link | null => (url ? { label, url } : null)
export const links = (...l: (Link | null | undefined)[]): Link[] => {
  const seen = new Set<string>()
  return l.filter((x): x is Link => !!x && !!x.url && !seen.has(x.url) && !!seen.add(x.url))
}

/** The idempotency key the unique index enforces: one row per source per company. */
export const ledgerKey = (sourceTable: string, sourceId: string, companyId: string) => `${sourceTable}:${sourceId}:${companyId}`

export function emailDraft(m: Row, opts: { domainKind: Map<string, string>; threadKind?: string | null; docs?: Row[]; policyId?: string | null; workItemId?: string | null }): LedgerDraft {
  const party = partyOf(m.from_address, opts.domainKind, opts.threadKind)
  const out = m.direction === 'outbound' || party === 'internal'
  return {
    occurred_at: m.sent_at ?? m.created_at, kind: out ? 'email_out' : 'email_in',
    title: (m.subject ?? '').trim() || '(no subject)', summary: ownText(m.body_text, m.subject),
    party, actor: bareEmail(m.from_address) || null, policy_id: opts.policyId ?? null, work_item_id: opts.workItemId ?? null,
    thread_id: m.thread_id ?? null,
    links: links(m.thread_id ? threadLink(m.thread_id) : null, gmailLink(m.gmail_message_id), ...(opts.docs ?? []).map(d => driveLink(d.filename ?? 'Document', d.drive_url))),
    source_table: 'email_messages', source_id: m.id,
  }
}

export function rebuiltDraft(r: Row, opts: { domainKind: Map<string, string>; threadKind?: string | null; fallbackDate?: string | null }): LedgerDraft {
  return {
    occurred_at: r.sent_at ?? opts.fallbackDate ?? r.created_at, kind: 'email_rebuilt',
    title: `${(r.subject ?? '').trim() || '(no subject)'} · rebuilt from ${r.origin === 'forward' ? 'a forward' : 'quoted history'}`,
    summary: ownText(r.body_text, r.subject), party: partyOf(r.from_address, opts.domainKind, opts.threadKind), actor: bareEmail(r.from_address) || null,
    policy_id: null, work_item_id: null, thread_id: r.thread_id ?? null, links: links(r.thread_id ? threadLink(r.thread_id) : null),
    source_table: 'rebuilt_messages', source_id: r.id,
  }
}

const label = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

export function documentDraft(d: Row, policy?: Row | null): LedgerDraft {
  return {
    occurred_at: d.received_at ?? d.created_at, kind: 'document',
    title: `${label(d.doc_type) || 'Document'} · ${d.filename ?? d.title ?? 'file'}`,
    summary: [d.insurer_name, d.policy_number, d.class_of_insurance, d.period_from && d.period_to ? `${d.period_from} to ${d.period_to}` : null, d.premium_text].filter(Boolean).join(' · ') || null,
    party: null, actor: d.from_address ? bareEmail(d.from_address) : d.uploaded_by ?? null,
    policy_id: d.policy_id ?? null, work_item_id: null, thread_id: d.thread_id ?? null,
    links: links(driveLink('Data room file', d.drive_url), driveLink('Policy folder', policy?.drive_folder_url), d.thread_id ? threadLink(d.thread_id) : null),
    source_table: 'policy_documents', source_id: d.id,
  }
}

const policyName = (p: Row) => [p.class_of_insurance ?? p.product_line ?? p.label ?? 'Policy', p.insurer, p.policy_number].filter(Boolean).join(' · ')

/** A policy is two dated events: it starts, and (once the date has passed) it ends. */
export function policyDrafts(p: Row, today: string): LedgerDraft[] {
  const base = { party: null, actor: null, policy_id: p.id, work_item_id: null, thread_id: null, links: links(driveLink('Policy folder', p.drive_folder_url)), source_table: 'policies' }
  const out: LedgerDraft[] = []
  if (p.start_date) out.push({ ...base, occurred_at: `${p.start_date}T00:00:00+08:00`, kind: 'policy', title: `Policy starts · ${policyName(p)}`, summary: [p.start_date && p.end_date ? `${p.start_date} to ${p.end_date}` : null, p.lifecycle].filter(Boolean).join(' · ') || null, source_id: `${p.id}:start` })
  if (p.end_date && p.end_date <= today) out.push({ ...base, occurred_at: `${p.end_date}T23:59:00+08:00`, kind: 'policy', title: `Policy ends · ${policyName(p)}`, summary: p.lifecycle ?? null, source_id: `${p.id}:end` })
  return out
}

export function debitNoteDraft(n: Row): LedgerDraft {
  const no = String(n.debit_note_no ?? '')
  const what = /^CN/i.test(no) ? 'Credit note' : 'Debit note'
  const amt = n.gross_amount ?? n.net_amount
  return {
    occurred_at: n.issue_date ? `${n.issue_date}T09:00:00+08:00` : n.created_at, kind: 'debit_note',
    title: `${what} ${no}${amt != null ? ` · ${n.currency ?? 'SGD'} ${Number(amt).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}`,
    summary: [n.insurer, n.event_type, n.status, n.payment_due_date ? `due ${n.payment_due_date}` : null].filter(Boolean).join(' · ') || null,
    party: null, actor: null, policy_id: n.policy_id ?? null, work_item_id: null, thread_id: null,
    links: links(driveLink('Debit note folder', n.drive_folder_url), driveLink('Debit note PDF', /^https?:/.test(n.pdf_storage_url ?? '') ? n.pdf_storage_url : null)),
    source_table: 'debit_notes', source_id: n.id,
  }
}

export function claimDraft(c: Row): LedgerDraft {
  return {
    occurred_at: c.notified_at ? `${c.notified_at}T09:00:00+08:00` : c.created_at, kind: 'claim',
    title: `Claim · ${[c.class, c.insurer_name, c.claimant].filter(Boolean).join(' · ') || 'opened'}`,
    summary: [c.stage, c.loss_date ? `loss ${c.loss_date}` : null, c.insurer_ref ? `ref ${c.insurer_ref}` : null, c.loss_summary].filter(Boolean).join(' · ') || null,
    party: null, actor: null, policy_id: c.policy_id ?? null, work_item_id: c.work_item_id ?? null, thread_id: null,
    links: links({ label: 'Claim', url: `/claims?claim=${c.id}` }), source_table: 'claims', source_id: c.id,
  }
}

/** An Employment Benefits quotation: its census, basis and start date, opening on Compare cover. */
export function quotationDraft(q: Row): LedgerDraft {
  const req = (q.requirement ?? {}) as Row
  return {
    occurred_at: q.created_at, kind: 'quotation',
    title: `Employment Benefits quotation · ${q.member_count ?? 0} lives`,
    summary: [q.basis === 'renewal' ? 'Renewal' : q.basis === 'new_business' ? 'New business' : null, q.effective_date ? `from ${q.effective_date}` : null, req.current_insurer ? `current insurer ${req.current_insurer}` : null, req.last_year?.total != null ? `last year ${req.last_year.total}` : null].filter(Boolean).join(' · ') || null,
    party: null, actor: null, policy_id: null, work_item_id: null, thread_id: null,
    links: links({ label: 'Compare cover', url: `/pricing-matrix/quote/${q.id}/compare` }), source_table: 'gb_quotations', source_id: q.id,
  }
}

/** A placement: cover asked of insurers for the client, by line. */
export function placementDraft(p: Row): LedgerDraft {
  return {
    occurred_at: p.created_at, kind: 'placement', title: `Placement · ${p.title ?? p.ref ?? 'cover requested'}`,
    summary: [p.ref, p.status, p.inception_date ? `inception ${p.inception_date}` : null].filter(Boolean).join(' · ') || null,
    party: null, actor: null, policy_id: null, work_item_id: null, thread_id: p.client_thread_id ?? null,
    links: links({ label: 'Placement', url: `/companies/${p.company_id}?tab=quotes` }), source_table: 'placements', source_id: p.id,
  }
}

export function caseEventDraft(e: Row, item: Row): LedgerDraft {
  const d = (e.detail ?? {}) as Row
  const bits = [d.status, d.next_action, d.opened ? `opened ${d.opened}` : null, d.note, d.reason].filter(x => typeof x === 'string' && x)
  return {
    occurred_at: e.created_at, kind: 'case', title: `${item.title ?? 'Case'} · ${e.kind}`,
    summary: bits.join(' · ') || null, party: e.actor && String(e.actor).includes('@') ? 'internal' : null, actor: e.actor ?? null,
    policy_id: item.policy_id ?? null, work_item_id: e.work_item_id, thread_id: null,
    links: links({ label: 'Work item', url: `/work?item=${e.work_item_id}` }), source_table: 'work_item_events', source_id: e.id,
  }
}

type Readable = { kind: string; party: string | null; actor: string | null; summary: string | null; title?: string | null }

/**
 * Pure: which reader an entry is worth, or null. Under a client's ledger: the client writing in,
 * in their own words ('client'), or an insurer writing on a thread filed against the client
 * ('insurer'). Never TRS, partners, TPAs, vendors, automated senders or mailing lists.
 */
export function factReader(e: Readable, companyKind: string | null | undefined): 'client' | 'insurer' | null {
  if (companyKind !== 'client' || e.kind !== 'email_in') return null
  if (e.party !== 'client' && e.party !== 'insurer') return null
  if (!e.actor || isAutomated(e.actor)) return null
  const text = `${e.title ?? ''}\n${e.summary ?? ''}`.toLowerCase()
  if (/unsubscribe|newsletter|webinar|view (this|it) in (your )?browser|mailing list/.test(text)) return null
  return (e.summary ?? '').trim().length >= 40 ? e.party : null
}

/** Pure: whether an entry is worth a fact read at all. */
export const factReadable = (e: Readable, companyKind: string | null | undefined): boolean => factReader(e, companyKind) !== null
