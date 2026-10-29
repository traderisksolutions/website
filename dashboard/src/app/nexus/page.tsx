import { redirect } from 'next/navigation'
import { FollowUpsLedger } from '@/components/nexus/FollowUpsLedger'

export const dynamic = 'force-dynamic'

/**
 * /nexus — the follow-ups ledger. Case review moved to /nexus/cases on 29 Oct 2026; links that
 * still open a case here (?case=, ?newCase=) are sent there with their query intact.
 */
export default async function NexusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  if (sp.case || sp.newCase) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v ? [v] : []) q.append(k, x)
    redirect(`/nexus/cases?${q.toString()}`)
  }
  return <FollowUpsLedger />
}
