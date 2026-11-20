import { Spinner } from '@/components/crm/primitives'
import { PageFrame } from '@/components/page-frame'

/** Shown at once on every navigation while a server page prepares its data. */
export default function Loading() {
  return (
    <PageFrame>
      <div className="h-10" aria-hidden />
      <Spinner label="Loading" rows={8} />
    </PageFrame>
  )
}
