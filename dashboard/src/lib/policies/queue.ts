/**
 * The company's approval queue: every draft waiting on a person, across its placements
 * (requests, chases, the client comparison) and its live EB policies (endorsement requests).
 */
import { sbTry } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import { reviewQueue } from '@/lib/placement/workflow'
import type { Placement, PlacementDispatch } from '@/lib/placement/types'
import { MOVEMENT_DRAFT_TYPE } from './inbound'
import type { PolicyMovement } from './types'

export type QueueKind = 'request' | 'chase' | 'client' | 'confirm' | 'movement'
export type QueueItem = {
  draft: store.DraftRow
  kind: QueueKind
  dispatches: PlacementDispatch[]
  movements: PolicyMovement[]
  placementId?: string
  policyId?: string
}

export async function companyReviewQueue(companyId: string): Promise<QueueItem[]> {
  const placements = await sbTry<Pick<Placement, 'id'>[]>(`placements?company_id=eq.${companyId}&select=id&order=created_at.desc`, [])
  const fromPlacements = (await Promise.all(placements.map(async p => (await reviewQueue(p.id)).map(x => ({ ...x, movements: [] as PolicyMovement[], placementId: p.id })))))
    .flat()

  const movements = await sbTry<PolicyMovement[]>(`policy_movements?company_id=eq.${companyId}&sent_draft_id=not.is.null&status=eq.reported&order=created_at.asc`, [])
  const draftIds = [...new Set(movements.map(m => m.sent_draft_id!))]
  const drafts = (await store.pendingDrafts(draftIds)).filter(d => d.status === 'pending' && d.email_type === MOVEMENT_DRAFT_TYPE)
  const fromPolicies: QueueItem[] = drafts.map(draft => {
    const mine = movements.filter(m => m.sent_draft_id === draft.id)
    return { draft, kind: 'movement', dispatches: [], movements: mine, policyId: mine[0]?.policy_id }
  })

  return [...fromPlacements, ...fromPolicies].sort((a, b) => a.draft.created_at.localeCompare(b.draft.created_at))
}
