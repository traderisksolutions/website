/**
 * Company-spine shapes as the UI reads them. The row and view types come from the shared
 * src/lib/policies/types.ts; this file adds the API payload shapes, the words shown for each
 * state, and the money format.
 */

import type { PlacementQuote } from '@/lib/placement/types'
import { LIFECYCLE_LABEL, type PolicyLifecycle } from '@/lib/policies/types'

export type {
  PolicyLifecycle, PolicyView, PolicyMember, PolicyMovement, PolicyTransaction, MovementKind, MovementStatus,
  PolicyPositionWeek as PolicyWeek,
} from '@/lib/policies/types'
import type { PolicyMember, PolicyMovement, PolicyTransaction, PolicyPositionWeek, MovementKind, MovementStatus } from '@/lib/policies/types'

export const lifecycleWord = (l: string | null | undefined): string => LIFECYCLE_LABEL[(l ?? '') as PolicyLifecycle] ?? (l ? l.charAt(0).toUpperCase() + l.slice(1) : '—')

/** placement_quotes after 20261027_company_spine.sql: source and plan label, dispatch optional. */
export type SpineQuote = PlacementQuote & { source?: 'insurer' | 'rate_table' | null; plan_label?: string | null; engine_run_id?: string | null }

/** GET /api/policies/[id]/members */
export interface MembersPayload {
  members: PolicyMember[]
  movements: PolicyMovement[]
  transactions: PolicyTransaction[]
  weekly: PolicyPositionWeek[]
  position: { pax_active: number; net_to_date: number; last_week: PolicyPositionWeek | null }
}

export const MOVEMENT_WORD: Record<MovementKind, string> = { join: 'Joiner', leave: 'Leaver', change: 'Change' }
export const MOVEMENT_STATUS_WORD: Record<MovementStatus, string> = { reported: 'Reported', sent: 'Sent to insurer', noted: 'Noted by insurer', settled: 'Settled', cancelled: 'Cancelled' }
export const RELATION_WORD: Record<string, string> = { employee: 'Employee', spouse: 'Spouse', child: 'Child', other: 'Other' }

/** `S$1,234.56`; a credit reads `-S$1,234.56`. Other currencies keep their code. */
export function fmtAmount(amount: number | null | undefined, currency: string | null | undefined = 'SGD'): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—'
  const n = Number(amount)
  const symbol = !currency || currency === 'SGD' ? 'S$' : `${currency} `
  const body = Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}${symbol}${body}`
}
