/**
 * The words of the drafts Phase B prepares, without a model. Pure.
 *
 * Short, courteous, plain English in TRS's tone, signed "{owner_name}" like the case worker's
 * drafts, so approving fills in the approver's name. A draft names only facts held on the case;
 * anything unknown is left out rather than guessed.
 */

export type DraftKind = 'request_missing' | 'chase_insurer' | 'chase_client' | 'renewal_notice'

export type DraftFacts = {
  greetingName: string | null
  clientName: string | null
  title: string
  policyNumber: string | null
  insurerName: string | null
  insurerRef: string | null
  claimant: string | null
  lossDate: string | null
  /** Items to ask for, for request_missing. */
  items?: string[]
  /** The date TRS last wrote, for chases. */
  lastSent?: string | null
  /** For renewals. */
  expiry?: string | null
  className?: string | null
  threadSubject: string | null
}

const fmt = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function refLine(f: DraftFacts): string {
  const parts = [
    f.policyNumber ? `Policy No. ${f.policyNumber}` : null,
    f.insurerRef ? `claim ref. ${f.insurerRef}` : null,
    f.claimant ? `claimant ${f.claimant}` : null,
    f.lossDate ? `loss on ${fmt(f.lossDate)}` : null,
  ].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

export function replySubject(threadSubject: string | null, fallback: string): string {
  const s = (threadSubject ?? '').trim()
  if (!s) return fallback
  return /^re:/i.test(s) ? s : `Re: ${s}`
}

export function buildDraft(kind: DraftKind, f: DraftFacts): { subject: string; body: string } {
  const hi = `Dear ${f.greetingName?.trim() || 'Sir/Madam'},`
  const sign = 'Best regards,\n{owner_name}\nTrade Risk Solutions'
  const what = `${f.title}${refLine(f)}`
  switch (kind) {
    case 'request_missing': {
      const items = (f.items ?? []).map(i => `- ${i}`).join('\n')
      return {
        subject: replySubject(f.threadSubject, `${f.title}: documents`),
        body: `${hi}\n\nThank you for your email on ${what}.\n\nTo take the claim forward with ${f.insurerName ?? 'the insurer'}, we still need:\n${items}\n\nPlease send them in reply to this email.\n\n${sign}`,
      }
    }
    case 'chase_insurer':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: status`),
        body: `${hi}\n\nWe refer to ${what}${f.lastSent ? `, last sent to you on ${fmt(f.lastSent)}` : ''}.\n\nPlease let us know the status, and whether anything further is required from the insured.\n\n${sign}`,
      }
    case 'chase_client':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: follow-up`),
        body: `${hi}\n\nWe refer to our email${f.lastSent ? ` of ${fmt(f.lastSent)}` : ''} on ${what}.\n\nPlease let us have your reply so that we can proceed.\n\n${sign}`,
      }
    case 'renewal_notice':
      return {
        subject: `Renewal: ${f.className ?? 'policy'}${f.policyNumber ? ` ${f.policyNumber}` : ''}${f.clientName ? `, ${f.clientName}` : ''}`,
        body: `${hi}\n\nYour ${f.className ?? ''} policy${f.policyNumber ? ` No. ${f.policyNumber}` : ''}${f.insurerName ? ` with ${f.insurerName}` : ''} expires on ${fmt(f.expiry) ?? 'the date on the schedule'}.\n\nPlease confirm any changes since the last renewal (for example headcount, sums insured, vehicles or turnover) so that we can obtain renewal terms.\n\n${sign}`.replace(/Your  policy/, 'Your policy'),
      }
  }
}
