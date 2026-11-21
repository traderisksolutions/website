import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { renewalsCall } from '@/app/renewals/gateway'

/** fetch() for Renewals's former routes, through one server action. */
export const renewalsFetch = actionFetch(renewalsCall, 'renewals')

/** callApi through the same action: same arguments, same errors. */
export const callRenewals = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: renewalsFetch })
