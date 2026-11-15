/**
 * Today › Mail: every thread the viewer may see, one row each, with its label and who set it.
 * The Inbox stays the place to read and reply; this view sorts the same threads by label and by
 * where they sit for the people working the client (relevance.ts). A person's label stands over
 * the rule's; a thread nobody labelled shows the rule's reading of its subject.
 *
 * The database answers one view at a time (today_mail, read by mail-store.ts): the counts and the
 * newest rows. mailView is the same answer over rows held in memory; the dogfood compares the two.
 *
 * Pure and browser-safe. Tested in __tests__/mail.test.ts.
 */
import { isLabel, labelOf, type Label } from './labels'
import { RELEVANCE, type Relevance } from './relevance'

/** Who set a thread's label: the rule, with what it matched on, or a person, with the day. */
export type SetBy = { kind: 'rule'; basis: string | null } | { kind: 'person'; email: string; at: string | null }

export function labelled(t: { subject: string | null; label?: string | null; label_by?: string | null; label_basis?: string | null; label_at?: string | null }): { label: Label; set_by: SetBy } {
  if (isLabel(t.label)) {
    if (t.label_by && t.label_by !== 'rule') return { label: t.label, set_by: { kind: 'person', email: t.label_by.toLowerCase(), at: t.label_at ?? null } }
    return { label: t.label, set_by: { kind: 'rule', basis: t.label_basis ?? null } }
  }
  const { label, basis } = labelOf({ subject: t.subject })
  return { label, set_by: { kind: 'rule', basis } }
}

export type MailRow = {
  id: string; subject: string | null; last_message_at: string | null
  company: { id: string; name: string | null } | null
  label: Label; set_by: SetBy; relevance: Relevance
  case: { id: string; title: string | null } | null
}

/** One row as today_mail returns it. */
export type MailRaw = {
  id: string; subject: string | null; display_subject: string | null; last_message_at: string | null
  company_id: string | null; company_name: string | null
  label: string | null; label_by: string | null; label_basis: string | null; label_at: string | null
  relevance: Relevance; case_id: string | null; case_title: string | null
}

export function mailRowOf(t: MailRaw): MailRow {
  return {
    id: t.id, subject: t.display_subject ?? t.subject ?? null, last_message_at: t.last_message_at ?? null,
    company: t.company_id ? { id: t.company_id, name: t.company_name ?? null } : null,
    ...labelled(t), relevance: t.relevance,
    case: t.case_id ? { id: t.case_id, title: t.case_title ?? null } : null,
  }
}

export type MailRelevance = Relevance | 'all'
export const isMailRelevance = (v: unknown): v is MailRelevance => v === 'all' || (typeof v === 'string' && (RELEVANCE as readonly string[]).includes(v))
export type MailFilter = { relevance: MailRelevance; label: Label | 'all'; limit: number }
export type MailView = { counts: Record<MailRelevance, number>; total: number; threads: MailRow[] }

export const MAIL_PAGE = 200

/** The rows a view lists, newest first. The counts follow the label filter, so each tab says what it holds. today_mail answers the same in SQL. */
export function mailView(rows: readonly MailRow[], f: MailFilter): MailView {
  const ofLabel = f.label === 'all' ? rows : rows.filter(r => r.label === f.label)
  const counts = { all: ofLabel.length, active: 0, back_burner: 0, member_movements: 0 } as Record<MailRelevance, number>
  for (const r of ofLabel) counts[r.relevance]++
  const shown = (f.relevance === 'all' ? [...ofLabel] : ofLabel.filter(r => r.relevance === f.relevance))
    .sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  return { counts, total: shown.length, threads: shown.slice(0, Math.max(1, f.limit)) }
}
