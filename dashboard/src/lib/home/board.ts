/**
 * Home board: the pinned companies as a kanban: one column per stage of the work,
 * one card per company with its threads, its policies and where each quote stands.
 *
 * A card sits in the column of its furthest-back open work: quoting (prices still awaited),
 * quoted (every price in, nothing presented), presented, bound (awaiting documents), in force.
 */
import { sbTry, normalizeCompany, type Json } from '@/lib/crm/db'
import { listStaff, type StaffMember } from '@/lib/crm/staff'
import { listCompanyThreads }        from '@/lib/crm/threads'
import { fmtDate }                   from '@/lib/crm/format'
import { listCompanyPolicies }       from '@/lib/policies/spine'
import { companyReviewQueue }        from '@/lib/policies/queue'
import { loadBundle }                from '@/lib/placement/store'
import { derivePositions }           from '@/lib/placement/position'
import type { LinePosition }         from '@/lib/placement/types'
import type { PolicyLifecycle, PolicyView } from '@/lib/policies/types'

export type BoardColumnKey = 'quoting' | 'quoted' | 'presented' | 'bound' | 'in_force'

export type BoardPolicy = {
  id: string
  label: string
  lifecycle: PolicyLifecycle
  /** One short phrase: "Quoted 3 of 5", "Pending", "Presented", "Bound with Income", "Live to 30 Nov 2027". */
  state: string
  insurer: string | null
  premium: number | null
  currency: string
  quoted: number
  asked: number
}

export type BoardCard = {
  company: { id: string; name: string; owners: string[]; pinned_at: string | null }
  threads: { total: number; awaiting: number }
  drafts: number
  policies: BoardPolicy[]
  next_step: string | null
  href: string
}

export type BoardColumn = { key: BoardColumnKey; label: string; cards: BoardCard[] }
export type HomeBoardPayload = { columns: BoardColumn[]; staff: StaffMember[] }

const COLUMNS: { key: BoardColumnKey; label: string }[] = [
  { key: 'quoting',   label: 'Quoting' },
  { key: 'quoted',    label: 'Quoted' },
  { key: 'presented', label: 'Presented' },
  { key: 'bound',     label: 'Bound' },
  { key: 'in_force',  label: 'In force' },
]
const RANK: Record<BoardColumnKey, number> = { quoting: 0, quoted: 1, presented: 2, bound: 3, in_force: 4 }

/** Lifecycles that are no longer work. They stay off the card. */
const DONE: PolicyLifecycle[] = ['declined', 'closed']

export async function homeBoard(): Promise<HomeBoardPayload> {
  const [rows, staff] = await Promise.all([
    sbTry<Json[]>(`companies?home_pinned_at=not.is.null&select=*&order=home_pinned_at.desc&limit=100`, []),
    listStaff(),
  ])
  const companies = rows.map(normalizeCompany)
  const built = await Promise.all(companies.map(c => buildCard(c.id, c.name, c.owner_emails, c.home_pinned_at ?? null)))

  const columns: BoardColumn[] = COLUMNS.map(c => ({ ...c, cards: [] }))
  for (const { card, column } of built) columns[RANK[column]].cards.push(card)
  for (const col of columns) col.cards.sort((a, b) => a.company.name.localeCompare(b.company.name))
  return { columns, staff }
}

async function buildCard(id: string, name: string, owners: string[], pinnedAt: string | null): Promise<{ card: BoardCard; column: BoardColumnKey }> {
  const [policies, bundle, threads, queue] = await Promise.all([
    listCompanyPolicies(id).catch(() => [] as PolicyView[]),
    loadBundle(id),
    listCompanyThreads(id).catch(() => []),
    companyReviewQueue(id).catch(() => []),
  ])
  const positions = derivePositions(bundle)
  const byLine = new Map(positions.map(p => [p.line.id, p]))
  const byPolicy = new Map(positions.filter(p => p.line.policy_id).map(p => [p.line.policy_id as string, p]))

  const shown = policies.filter(p => !DONE.includes(p.lifecycle))
  const cardPolicies = shown.map(p => {
    const pos = (p.placement_line_id ? byLine.get(p.placement_line_id) : undefined) ?? byPolicy.get(p.id) ?? null
    return describePolicy(p, pos)
  })

  // The column: the furthest-back open work. Nothing at all means the quote has not started.
  let column: BoardColumnKey = 'in_force'
  const ranks = shown.map(p => {
    const pos = (p.placement_line_id ? byLine.get(p.placement_line_id) : undefined) ?? byPolicy.get(p.id) ?? null
    return columnFor(p, pos)
  })
  if (ranks.length === 0) column = 'quoting'
  else column = ranks.sort((a, b) => RANK[a] - RANK[b])[0]

  // The next step: the first line still being worked, open lines before bound ones.
  const working = positions.filter(p => p.line.status !== 'declined' && p.line.status !== 'closed' && p.line.next_step)
  const next = working.find(p => p.line.status !== 'bound') ?? working[0] ?? null

  return {
    column,
    card: {
      company: { id, name, owners, pinned_at: pinnedAt },
      threads: { total: threads.length, awaiting: threads.filter(t => t.needsReply).length },
      drafts: queue.length,
      policies: cardPolicies,
      next_step: next?.line.next_step ?? null,
      href: `/companies/${id}`,
    },
  }
}

function askedOf(pos: LinePosition | null): number {
  if (!pos) return 0
  return pos.dispatches.filter(d => d.dispatch.status !== 'withdrawn').length + pos.engineQuotes.length
}

function columnFor(p: PolicyView, pos: LinePosition | null): BoardColumnKey {
  switch (p.lifecycle) {
    case 'quoting': {
      const asked = askedOf(pos)
      if (asked === 0 || !pos) return 'quoting'
      return pos.awaitingCount > 0 ? 'quoting' : 'quoted'
    }
    case 'presented': return 'presented'
    case 'bound':     return 'bound'
    default:          return 'in_force'
  }
}

function describePolicy(p: PolicyView, pos: LinePosition | null): BoardPolicy {
  const asked = askedOf(pos)
  const quoted = pos?.quotedCount ?? 0
  const label = p.label ?? p.class_of_insurance ?? p.product_line ?? 'Policy'
  let state: string
  switch (p.lifecycle) {
    case 'quoting':     state = asked > 0 && quoted > 0 ? `Quoted ${quoted} of ${asked}` : 'Pending'; break
    case 'presented':   state = 'Presented'; break
    case 'bound':       state = p.insurer ? `Bound with ${p.insurer}` : 'Bound'; break
    case 'live':        state = p.end_date ? `Live to ${fmtDate(p.end_date)}` : 'Live'; break
    case 'renewal_due': state = 'Renewal due'; break
    case 'lapsed':      state = 'Lapsed'; break
    case 'declined':    state = 'Declined'; break
    case 'closed':      state = 'Closed'; break
  }
  return {
    id: p.id, label, lifecycle: p.lifecycle, state,
    insurer: p.insurer, premium: p.bound_premium ?? p.premium ?? null, currency: p.currency,
    quoted, asked,
  }
}
