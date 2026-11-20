import { redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadPlace } from '@/lib/agents/place'
import { AgentsList } from '@/components/agents/AgentsPlace'

export const dynamic = 'force-dynamic'

/** AI Agents: every agent with its key, status, runs and spend, read on the server. */
export default async function AgentsPage() {
  const user = await staffUser()
  if (!user?.email) redirect('/login?next=%2Fagents')
  return <AgentsList place={await loadPlace()} />
}
