import { notFound, redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadAgent, loadAgentDocs } from '@/lib/agents/place'
import { AgentPage } from '@/components/agents/AgentsPlace'

export const dynamic = 'force-dynamic'

/** One agent: its workflow, runs a day and figures, read on the server. */
export default async function Agent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await staffUser()
  if (!user?.email) redirect(`/login?next=${encodeURIComponent(`/agents/${id}`)}`)
  const a = await loadAgent(id)
  if (!a) notFound()
  return <AgentPage a={a} docs={await loadAgentDocs(a.id)} />
}
