import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { todayCall } from '@/app/today/gateway'

/** fetch() for Today's former routes, through one server action. */
export const todayFetch = actionFetch(todayCall)

/** callApi through the same action: same arguments, same errors. */
export const callToday = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: todayFetch })
