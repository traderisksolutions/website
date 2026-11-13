import { redirect } from 'next/navigation'

/**
 * A quotation opens on Compare cover (13 Nov 2026). The older quotation page (engine prices per
 * insurer, exports, enrolment files) was retired: enrolment files and the client report are on
 * Compare cover, the census on Census and policy.
 */
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/pricing-matrix/quote/${id}/compare`)
}
