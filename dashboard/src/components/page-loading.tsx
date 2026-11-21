import { PageFrame } from '@/components/page-frame'
import { Spinner } from '@/components/crm/primitives'

/**
 * What a section shows the moment a link to it is clicked, while its server page reads (21 Nov
 * 2026: clicks felt frozen because a server page shows nothing until its read is done). The same
 * frame and table placeholder as every page, so nothing jumps when the page arrives.
 */
export function PageLoading({ label }: { label?: string }) {
  return (
    <PageFrame>
      <span className="trs-sk h-[22px] w-[220px]" aria-hidden />
      <Spinner label={label} rows={8} />
    </PageFrame>
  )
}
