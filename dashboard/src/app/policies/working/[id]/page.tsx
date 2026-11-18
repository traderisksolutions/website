import { Suspense } from 'react'
import { PolicyWorking } from '@/components/policies/PolicyWorking'

export const dynamic = 'force-dynamic'

/** One policy being worked on: Overview, Request, Quotes and Activity (src/components/policies/PolicyWorking.tsx). */
export default async function PolicyWorkingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense fallback={null}><PolicyWorking lineId={id} /></Suspense>
}
