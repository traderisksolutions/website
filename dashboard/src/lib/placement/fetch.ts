import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { placementsCall } from '@/app/placements/gateway'

/** fetch() for Placements' former /api/placements routes, through one server action. */
export const placementsFetch = actionFetch(placementsCall, 'placements')

/** callApi through the same action: same arguments, same errors. */
export const callPlacements = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: placementsFetch })
