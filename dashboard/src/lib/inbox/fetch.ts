import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { inboxCall } from '@/app/engagement/gateway'

/** fetch() for the Inbox's former routes, through one server action. */
export const inboxFetch = actionFetch(inboxCall, 'inbox')

/** callApi through the same action: same arguments, same errors. */
export const callInbox = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: inboxFetch })
