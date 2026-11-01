/**
 * The words of the drafts Phase B prepares, without a model. Pure.
 *
 * Short, courteous, plain English in TRS's tone, signed "{owner_name}" like the case worker's
 * drafts, so approving fills in the approver's name. A draft names only facts held on the case;
 * anything unknown is left out rather than guessed.
 */

export type DraftKind = 'request_missing' | 'chase_insurer' | 'chase_client' | 'renewal_notice' | 'forward_to_insurer' | 'client_update' | 'client_ack'
export type Party = 'client' | 'insurer'

/**
 * A matter with two parties gets two drafts that go out together: the insurer email, and the
 * note that tells the client what was done. Kinds with no counterpart return null.
 */
export function pairFor(kind: DraftKind): DraftKind | null {
  if (kind === 'chase_insurer') return 'client_update'
  if (kind === 'forward_to_insurer') return 'client_ack'
  return null
}

export function partyOf(kind: DraftKind): Party {
  return kind === 'chase_insurer' || kind === 'forward_to_insurer' ? 'insurer' : 'client'
}

/** The client's message a forward carries, quoted under the cover note. */
export type Original = { from: string; sent_at: string | null; subject: string | null; text: string }

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
  /** For forward_to_insurer: the client's own message. */
  original?: Original | null
  /** For forward_to_insurer and client_ack: the files sent on. */
  files?: string[]
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
    case 'client_update':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: update`),
        body: `${hi}\n\nAn update on ${what}: we have asked ${f.insurerName ?? 'the insurer'} for the status today and will let you know as soon as they reply.\n\n${sign}`,
      }
    case 'client_ack':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: received`),
        body: `${hi}\n\nThank you. We have notified ${f.insurerName ?? 'the insurer'} of ${what}${(f.files ?? []).length ? ' and sent the documents you provided' : ''}. We will send you the claim reference and any further requirements once they reply.\n\n${sign}`,
      }
    case 'forward_to_insurer':
      return composeForward(f)
  }
}

/** Pure. A new client claim sent on to the insurer: a short cover note, then the client's message. */
export function composeForward(f: DraftFacts): { subject: string; body: string } {
  const sign = 'Best regards,\n{owner_name}\nTrade Risk Solutions'
  const o = f.original
  const subject = [`New claim`, f.clientName, f.policyNumber, f.title && !/^new claim$/i.test(f.title) ? f.title : null].filter(Boolean).join(' – ').slice(0, 200)
  const files = (f.files ?? []).length ? `\nAttached: ${(f.files ?? []).join(', ')}.\n` : ''
  const quoted = o ? [
    '---------- Forwarded message ----------',
    `From: ${o.from}`,
    o.sent_at ? `Date: ${fmt(o.sent_at)}` : null,
    o.subject ? `Subject: ${o.subject}` : null,
    '',
    o.text.trim(),
  ].filter(l => l !== null).join('\n') : ''
  const whose = f.clientName ? `our client ${f.clientName}'s` : `our client's`
  const body = `Dear Claims Team,\n\nPlease find below ${whose} notification of a claim${f.policyNumber ? ` under Policy No. ${f.policyNumber}` : ''}${f.lossDate ? `, loss on ${fmt(f.lossDate)}` : ''}.\n${files}\nPlease register the claim and let us have the claim reference and the documents you require.\n\n${sign}${quoted ? `\n\n${quoted}` : ''}`
  return { subject, body }
}

/**
 * Pure. A claim still needs sending to the insurer when nothing on the case has reached the
 * insurer side yet: no insurer message, and no TRS message addressed to an insurer.
 */
export function needsForwardToInsurer(lines: { side: string; rebuilt?: boolean; toInsurer?: boolean }[], stage: string): boolean {
  if (stage !== 'notified' && stage !== 'documents_pending') return false
  if (!lines.some(l => l.side === 'client')) return false
  return !lines.some(l => l.side === 'insurer' || (l.side === 'trs' && l.toInsurer))
}
