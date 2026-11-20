import { LinkBtn } from '@/components/crm/primitives'
import { PageFrame } from '@/components/page-frame'
import { PageHeader } from '@/components/page-header'

/** An address with no page, or a record that does not exist. */
export default function NotFound() {
  return (
    <PageFrame width="read">
      <PageHeader title="Page not found" actions={<LinkBtn href="/today" level="primary">Today</LinkBtn>} />
      <p className="m-0 text-sm text-trs-muted">The address has no page, or the record was removed.</p>
    </PageFrame>
  )
}
