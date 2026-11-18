import { Suspense } from 'react'
import { LinesLibrary } from '@/components/placement/LinesLibrary'

export const dynamic = 'force-dynamic'

/** Quotes › Lines: per line, what the client sends, what insurers ask, the drafts and Knowledge for AI. */
export default function LinesPage() {
  return <Suspense fallback={null}><LinesLibrary /></Suspense>
}
