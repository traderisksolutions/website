import { redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadPlace } from '@/lib/agents/place'
import { AgentsUsage } from '@/components/agents/AgentsPlace'

export const dynamic = 'force-dynamic'

/** AI Agents › Usage: calls, tokens and S$ by agent and by model, last 30 days against the 30 before. */
export default async function UsagePage() {
  const user = await staffUser()
  if (!user?.email) redirect('/login?next=%2Fagents%2Fusage')
  return <AgentsUsage place={await loadPlace()} />
}
