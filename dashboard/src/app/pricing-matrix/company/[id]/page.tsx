/**
 * /pricing-matrix/company/<companyId>: the company's Employment Benefits. Redirects to its newest
 * quotation's Compare cover, or to New quotation for the company. The trail in the link's hash
 * survives the redirect, so Back on the landing page returns to the company or the thread.
 */
import { notFound, redirect } from 'next/navigation'
import { companyEbHref } from '@/lib/gb/company-eb'

export const dynamic = 'force-dynamic'

export default async function CompanyEbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const href = await companyEbHref(id)
  if (!href) notFound()
  redirect(href)
}
