/**
 * /pricing-matrix/company/<companyId>: the old address of a company's Employment Benefits. Since
 * 20 Nov 2026 it lands on the company page's Employment Benefits tab, which lists its quotations and
 * opens New quotation with the company filled.
 */
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CompanyEbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  redirect(`/companies/${id}?tab=eb`)
}
