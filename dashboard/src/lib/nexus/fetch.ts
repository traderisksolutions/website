import { actionFetch } from '@/lib/action-fetch'
import { nexusCall } from '@/app/nexus/gateway'

/** fetch() for Nexus's former /api/nexus routes, through one server action. */
export const nexusFetch = actionFetch(nexusCall)
