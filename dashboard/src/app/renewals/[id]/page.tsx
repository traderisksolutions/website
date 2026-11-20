import { RenewalDetail } from '@/components/renewals/RenewalDetail'

export const dynamic = 'force-dynamic'

/** One renewal: facts, stage, tasks, close, lines held (docs/renewals.md, release 2). */
export default async function RenewalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RenewalDetail id={id} />
}
