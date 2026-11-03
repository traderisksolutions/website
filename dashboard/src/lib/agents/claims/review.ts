/**
 * Claim sub-agents: the first actions and deadlines each class carries, which the document
 * checklist (src/lib/admin/b/claim-read.ts CHECKLIST) does not. Pure; tested in
 * src/lib/agents/__tests__/renewal-claims.test.ts. See docs/agent-routing.md (phase 4).
 *
 *   wica          the employer reports to MOM through iReport within 10 days when the injury
 *                 gives more than 3 days' medical leave or 24 hours in hospital
 *   motor         the accident is reported to the insurer within 24 hours or by the next working
 *                 day; the vehicle is not repaired before the insurer's survey
 *   property      theft is reported to the police; damaged items are kept for the adjuster
 *   liability     nothing is admitted to the third party; its letters go to the insurer unanswered
 *   marine        the carrier is put on notice in writing; packaging is kept for the surveyor
 *   trade credit  the overdue is notified within the policy's time limit; further supplies to the
 *                 buyer stop once it is notified
 *   financial     PI and D&O are claims-made: the claim or circumstance is notified within the
 *                 policy period, and nothing is admitted
 *
 * The class comes in two vocabularies: the claims agent's (wica, ghs, motor…) and the mail
 * backfill's of 3 Nov 2026 (WICA, EB, CAR, PI…). Both are read.
 */
import { addDays } from '@/lib/admin/b/dates'
import type { ClaimClass } from '@/lib/admin/b/claim-read'

export type ClaimFacts = { cls: ClaimClass | string; text: string; lossDate: string | null; today: string; policyLine?: string | null }
export type ClaimReview = {
  kind: ClaimClass | 'trade_credit' | 'financial'
  /** Items asked of the client, as claim gaps. */
  asks: { item: string; basis: string }[]
  notes: string[]
  /** A deadline the client must meet, when the mail gives the date it runs from. */
  deadline: { what: string; by: string } | null
}

const CREDIT = /\b(trade credit|credit insurance|coface|atradius|allianz trade|euler hermes|overdue|non-?payment|buyer(?:'s)? (?:insolvency|default)|credit limit)\b/i
const done = (re: RegExp, text: string) => re.test(text)

/** Either vocabulary, as the claims agent's class or one of this file's own kinds. */
export function claimKind(cls: string): ClaimClass | 'trade_credit' | 'financial' {
  const c = cls.toLowerCase()
  if (c === 'trade_credit') return 'trade_credit'
  if (c === 'pi' || c === 'd&o' || c === 'do' || c === 'cyber') return 'financial'
  if (c === 'car') return 'property'
  if (c === 'eb' || c === 'fwmi' || c === 'gtl') return 'ghs'
  return c as ClaimClass
}

export function reviewClaim(f: ClaimFacts): ClaimReview {
  const t = f.text
  const k = claimKind(f.cls)
  const credit = k === 'trade_credit' || f.policyLine === 'trade_credit' || (k === 'other' && CREDIT.test(t))
  if (credit) return {
    kind: 'trade_credit',
    asks: [
      { item: 'The unpaid invoices, with due dates and the amounts outstanding', basis: 'trade credit claim' },
      { item: 'Your correspondence chasing the buyer for payment', basis: 'trade credit claim' },
    ],
    notes: ['Notify the overdue within the policy\'s time limit, and stop further supplies to the buyer once it is notified'],
    deadline: null,
  }
  switch (k) {
    case 'wica': {
      const reported = done(/\bireport\b|reported to mom|mom (?:report|acknowledg)/i, t)
      return {
        kind: 'wica',
        asks: reported ? [] : [{ item: 'The MOM iReport acknowledgement for the accident', basis: 'employer must report to MOM' }],
        notes: ['MOM iReport within 10 days when the injury gives more than 3 days\' medical leave or 24 hours in hospital'],
        deadline: !reported && f.lossDate ? { what: 'MOM iReport', by: addDays(f.lossDate, 10) } : null,
      }
    }
    case 'motor': return {
      kind: 'motor',
      asks: done(/\bgia\b|accident report/i, t) ? [] : [{ item: 'The accident report made to the insurer (GIA report)', basis: 'motor claims framework' }],
      notes: ['Report to the insurer within 24 hours or by the next working day; no repair before the insurer\'s survey'],
      deadline: f.lossDate ? { what: 'accident report to the insurer', by: addDays(f.lossDate, 1) } : null,
    }
    case 'property': return {
      kind: 'property',
      asks: /theft|burglar|stolen|break-?in/i.test(t) && !done(/police report/i, t) ? [{ item: 'The police report for the theft', basis: 'theft or burglary claim' }] : [],
      notes: ['Keep damaged items and photographs for the loss adjuster; nothing is thrown away before the inspection'],
      deadline: null,
    }
    case 'liability': return {
      kind: 'liability', asks: [{ item: "The third party's letter or claim, as received", basis: 'liability claim' }],
      notes: ['Nothing is admitted to the third party; its letters go to the insurer unanswered'], deadline: null,
    }
    case 'marine': return {
      kind: 'marine', asks: [{ item: 'Your written notice of claim to the carrier', basis: 'cargo claim' }],
      notes: ['Put the carrier on notice in writing and keep the packaging for the surveyor'], deadline: null,
    }
    case 'financial': return {
      kind: 'financial', asks: [{ item: 'The letter of demand or complaint, as received', basis: 'claims-made cover' }],
      notes: ['Claims-made: notify the claim or circumstance within the policy period; admit nothing'], deadline: null,
    }
    default: return { kind: k as ClaimClass, asks: [], notes: [], deadline: null }
  }
}
