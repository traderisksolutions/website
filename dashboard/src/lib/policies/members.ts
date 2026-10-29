/**
 * Members of an employment-benefits policy, and the movements that change them.
 *
 * The census seeds the list at bind. After that every join, leave or change the client reports
 * is a policy_movements row, applied to policy_members at once: a joiner becomes an active
 * member, a leaver is closed off by name, a change is recorded in detail only. The insurer's
 * note settles the movement later (transactions.ts); the list itself never waits for it.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { insert, patch } from '@/lib/placement/store'
import type { MemberRelationship, MovementKind, PolicyMember, PolicyMovement, PolicyRow } from './types'
import { MEMBER_RELATIONSHIPS } from './types'

const SEL = { 'Prefer': 'return=representation' }

/** Names compare without case, punctuation or spacing: "TAN AH KOW" is "Tan, Ah Kow". */
export const normName = (s: string | null | undefined): string =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

export const asRelationship = (v: unknown): MemberRelationship => {
  const s = String(v ?? '').trim().toLowerCase()
  if ((MEMBER_RELATIONSHIPS as string[]).includes(s)) return s as MemberRelationship
  if (/^(staff|member|principal|emp)/.test(s)) return 'employee'
  if (/^(wife|husband|partner)/.test(s)) return 'spouse'
  if (/^(son|daughter|dependant|dependent|kid)/.test(s)) return 'child'
  return s ? 'other' : 'employee'
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// ── Policy ──────────────────────────────────────────────────────────────────────────────────

export async function policyRow(id: string): Promise<PolicyRow | null> {
  const rows = await sbTry<PolicyRow[]>(`policies?id=eq.${id}&limit=1`, [])
  return rows[0] ?? null
}

/** The EB policies that carry members today: bound or later, not yet lapsed or closed. */
export async function liveEbPolicies(companyId?: string): Promise<PolicyRow[]> {
  const f = companyId ? `&company_id=eq.${companyId}` : ''
  return sbTry<PolicyRow[]>(`policies?is_eb=eq.true&lifecycle=in.(bound,live,renewal_due)${f}&order=bound_at.desc.nullslast,created_at.desc`, [])
}

// ── Members ─────────────────────────────────────────────────────────────────────────────────

export async function listMembers(policyId: string): Promise<PolicyMember[]> {
  return sbTry<PolicyMember[]>(`policy_members?policy_id=eq.${policyId}&order=status.asc,member_name.asc`, [])
}

/**
 * Seeds policy_members from the census the policy was priced on. Idempotent: a policy that
 * already has members keeps them, so a second bind call cannot double the list. Returns the
 * number of rows written.
 */
export async function seedMembersFromCensus(
  policyId: string,
  companyId: string,
  members: { name: string; relationship: string; dob?: string | null; category?: string | null; employee_ref?: string | null }[],
): Promise<number> {
  const existing = await sbTry<{ id: string }[]>(`policy_members?policy_id=eq.${policyId}&select=id&limit=1`, [])
  if (existing.length > 0) return 0
  const rows = members
    .filter(m => typeof m.name === 'string' && m.name.trim())
    .map(m => ({
      policy_id: policyId, company_id: companyId, member_name: m.name.trim().slice(0, 200),
      relationship: asRelationship(m.relationship), employee_ref: m.employee_ref?.trim() || null,
      dob: isDate(m.dob) ? m.dob : null, category: m.category?.trim() || null, status: 'active', source: 'census',
    }))
  if (rows.length === 0) return 0
  let n = 0
  for (let i = 0; i < rows.length; i += 200) {
    const made = await insert<{ id: string }>('policy_members', rows.slice(i, i + 200))
    n += made.length
  }
  return n
}

/** The active member a reported name refers to, or null. Exact normalised match first, then a
 *  name that contains the other (a note may drop a middle name). */
export function findMember<T extends { member_name: string; status: string }>(members: T[], name: string): T | null {
  const n = normName(name)
  if (!n) return null
  const active = members.filter(m => m.status === 'active')
  const exact = active.find(m => normName(m.member_name) === n)
  if (exact) return exact
  if (n.length < 6) return null
  const contains = active.filter(m => { const k = normName(m.member_name); return k.length >= 6 && (k.includes(n) || n.includes(k)) })
  return contains.length === 1 ? contains[0] : null
}

// ── Movements ───────────────────────────────────────────────────────────────────────────────

export async function listMovements(policyId: string): Promise<PolicyMovement[]> {
  return sbTry<PolicyMovement[]>(`policy_movements?policy_id=eq.${policyId}&order=effective_on.desc.nullslast,created_at.desc`, [])
}

export type NewMovement = {
  kind: MovementKind
  member_name: string
  relationship?: string | null
  effective_on?: string | null
  pax?: number | null
  detail?: Record<string, unknown>
  reported_thread_id?: string | null
  reported_message_id?: string | null
}

/**
 * Writes the movement and applies it to the member list in the same call:
 *   join   → a new active member (joined_on = effective date)
 *   leave  → the matched active member gets left_on and status 'left'
 *   change → recorded in detail only; the member row is linked when the name matches
 */
export async function recordMovement(policyId: string, companyId: string, m: NewMovement): Promise<PolicyMovement> {
  const name = m.member_name.trim().slice(0, 200)
  if (!name) throw new Error('Member name is required')
  const members = await listMembers(policyId)
  const matched = findMember(members, name)
  const detail = m.detail && typeof m.detail === 'object' ? m.detail : {}
  const effective = isDate(m.effective_on) ? m.effective_on : null
  let memberId: string | null = matched?.id ?? null

  if (m.kind === 'join') {
    const rel = asRelationship(m.relationship ?? detail.relationship)
    const [member] = await insert<PolicyMember>('policy_members', {
      policy_id: policyId, company_id: companyId, member_name: name, relationship: rel,
      dob: isDate(detail.dob) ? detail.dob : null, category: typeof detail.category === 'string' ? detail.category : null,
      plan_code: typeof detail.plan === 'string' ? detail.plan : null, employee_ref: typeof detail.employee_ref === 'string' ? detail.employee_ref : null,
      joined_on: effective, status: 'active', source: 'movement',
    })
    memberId = member?.id ?? null
  } else if (m.kind === 'leave' && matched) {
    await patch('policy_members', `id=eq.${matched.id}`, { left_on: effective, status: 'left' })
  }

  const [row] = await insert<PolicyMovement>('policy_movements', {
    policy_id: policyId, company_id: companyId, kind: m.kind, member_id: memberId, member_name: name,
    relationship: m.relationship?.trim() || matched?.relationship || null, effective_on: effective,
    pax: Math.max(1, Math.round(Number(m.pax ?? 1) || 1)), detail: matched ? detail : { ...detail, ...(m.kind !== 'join' ? { unmatched: true } : {}) },
    reported_thread_id: m.reported_thread_id ?? null, reported_message_id: m.reported_message_id ?? null, status: 'reported',
    // Typed copies of what the client reported, for the insurer's sheet and for analytics.
    last_day: isDate(detail.last_day) ? detail.last_day : null, employment_date: isDate(detail.employment_date) ? detail.employment_date : null,
    category: typeof detail.category === 'string' ? detail.category.slice(0, 80) : matched?.category ?? null,
    plan_code: typeof detail.plan === 'string' ? detail.plan.slice(0, 80) : matched?.plan_code ?? null,
  })
  return row
}

/** Movements still waiting for the insurer's note, oldest first. */
export async function openMovements(policyId: string): Promise<PolicyMovement[]> {
  return sbTry<PolicyMovement[]>(`policy_movements?policy_id=eq.${policyId}&status=in.(reported,sent)&transaction_id=is.null&order=created_at.asc`, [])
}

export async function movementsForDraft(draftId: string): Promise<PolicyMovement[]> {
  return sbTry<PolicyMovement[]>(`policy_movements?sent_draft_id=eq.${enc(draftId)}&order=created_at.asc`, [])
}

/** The movements a sent draft covered: status 'sent', stamped with the time. */
export async function markMovementsSent(draftId: string, at = new Date().toISOString()): Promise<PolicyMovement[]> {
  return sb<PolicyMovement[]>(`policy_movements?sent_draft_id=eq.${enc(draftId)}&status=eq.reported`, {
    // The insurer is chased if no note has come back a week after the request went.
    method: 'PATCH', headers: SEL, body: JSON.stringify({ status: 'sent', sent_at: at, updated_at: at, next_chase_at: new Date(Date.parse(at) + 7 * 86_400_000).toISOString() }),
  })
}
