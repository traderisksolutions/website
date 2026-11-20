import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageFrame } from '@/components/page-frame'
import { CompanyWorkspace } from '@/components/companies/CompanyWorkspace'
import { staffUser } from '@/lib/auth/guard'
import { loadCompanyWorkspace, type CompanyWorkspaceData } from '@/lib/companies/workspace'

export const dynamic = 'force-dynamic'

/**
 * The company page: read on the server in one round, handed to the workspace with nothing left to
 * fetch. The read runs as the signed-in person, so their colleagues' private threads stay counted
 * and unlisted; with no TRS session nothing is read.
 */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await staffUser()
  if (!user?.email) redirect(`/login?next=${encodeURIComponent(`/companies/${id}`)}`)

  let data: CompanyWorkspaceData | null = null
  let failed = false
  try { data = await loadCompanyWorkspace(id, user.email.toLowerCase()) } catch (e) { failed = true; console.error('[companies/[id]] load failed', e) }

  if (!data) {
    return (
      <PageFrame>
        <Link href="/companies" className="text-body text-trs-muted no-underline hover:underline">Companies</Link>
        <p className="m-0 text-body text-trs-muted">{failed ? 'Could not load this company.' : 'Company not found.'}</p>
      </PageFrame>
    )
  }
  // Keyed by company: moving from one company to another starts from that company's data.
  return <CompanyWorkspace key={id} id={id} initial={data} />
}
