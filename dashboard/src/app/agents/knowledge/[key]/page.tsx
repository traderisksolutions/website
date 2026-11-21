import { notFound, redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadKnowledge } from '@/lib/agents/place'
import { history } from '@/lib/agents/documents'
import { isKnowledgeKey } from '@/lib/agents/knowledge'
import { KnowledgeDoc } from '@/components/agents/AgentsPlace'

export const dynamic = 'force-dynamic'

/** One knowledge text and its versions. */
export default async function KnowledgeText({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const user = await staffUser()
  if (!user?.email) redirect(`/login?next=${encodeURIComponent(`/agents/knowledge/${key}`)}`)
  if (!isKnowledgeKey(key)) notFound()
  const k = (await loadKnowledge()).find(r => r.key === key)
  if (!k || k.kind !== 'text') notFound()
  return <KnowledgeDoc k={k} versions={await history(`kn:${key}`).catch(() => [])} />
}
