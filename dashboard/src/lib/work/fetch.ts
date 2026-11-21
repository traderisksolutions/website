import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { workCall } from '@/app/work/gateway'

/** fetch() for Cases (work items)'s former routes, through one server action. */
export const workFetch = actionFetch(workCall)

/** callApi through the same action: same arguments, same errors. */
export const callWork = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: workFetch })
