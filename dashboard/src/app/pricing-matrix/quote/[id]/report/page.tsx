import { redirect } from 'next/navigation'

/** The client report is on Compare cover now: download, WhatsApp or email (13 Nov 2026). */
export default async function QuoteReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/pricing-matrix/quote/${id}/compare`)
}
