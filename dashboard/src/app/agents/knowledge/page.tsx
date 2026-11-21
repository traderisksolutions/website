import { redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadKnowledge } from '@/lib/agents/place'
import { KnowledgePlace } from '@/components/agents/AgentsPlace'

export const dynamic = 'force-dynamic'

/** AI Agents › Knowledge: every text and Drive source the agents read, with who reads it. */
export default async function KnowledgePage() {
  const user = await staffUser()
  if (!user?.email) redirect('/login?next=%2Fagents%2Fknowledge')
  return <KnowledgePlace rows={await loadKnowledge()} />
}
