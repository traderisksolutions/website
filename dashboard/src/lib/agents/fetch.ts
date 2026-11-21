import { actionFetch } from '@/lib/action-fetch'
import { callApi } from '@/components/placement/shared'
import { agentsCall } from '@/app/agents/gateway'

/** fetch() for AI Agents's former routes, through one server action. */
export const agentsFetch = actionFetch(agentsCall, 'agents')

/** callApi through the same action: same arguments, same errors. */
export const callAgents = <T,>(url: string, init?: { method?: string; body?: unknown }) => callApi<T>(url, { ...init, via: agentsFetch })
