import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { ebCall } from '@/app/eb/gateway'

/** fetch() for Employment Benefits's former routes, through one server action. */
export const ebFetch = actionFetch(ebCall)

/** callApi through the same action: same arguments, same errors. */
export const callEb = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: ebFetch })
