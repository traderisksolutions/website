import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isStaff } from '@/lib/auth/guard'
import { inboxFirst, type InboxFirst } from '@/lib/engagement/inbox-first'
import { InboxClient } from '@/components/engagement/InboxClient'

export const dynamic = 'force-dynamic'

type Params = { lead?: string | string[]; thread?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null

/**
 * The Inbox. The first screen is read here, on the server, for the signed-in person
 * (src/lib/engagement/inbox-first.ts): the list with its counts and mailbox names, the form leads,
 * the drafts, the staff, and the open thread with what the rail shows first. The page paints with it;
 * InboxClient takes over from there. No session: the sign-in page, before any read.
 */
export default async function EngagementPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user?.email || !isStaff(user)) redirect('/login?next=%2Fengagement')
  const sp = await searchParams
  // ?thread= is what claims, the policy ledger and the queue link with; it means the same as ?lead=.
  const link = one(sp.lead) ?? one(sp.thread)
  let initial: InboxFirst | null = null
  try {
    initial = await inboxFirst(user.email.toLowerCase(), link)
  } catch (e) {
    // The list reads itself and shows the error with Retry.
    console.error('[engagement] first screen read failed', e)
  }
  return (
    <Suspense>
      <InboxClient initial={initial} />
    </Suspense>
  )
}
