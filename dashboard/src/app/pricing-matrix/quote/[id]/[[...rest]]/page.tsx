/**
 * The old quotation pages (Compare cover, Census and policy, One change at a time, Plan builder,
 * report) were deleted on 20 Nov 2026 once the gb_quotations were re-priced into the Quotation
 * register (scripts/eb-reprice-legacy.ts). Every old address lands on the re-priced proposal
 * (eb_quotations.legacy_gb_id = the old id); a quotation not moved lands on the register.
 */
import { redirect } from 'next/navigation'
import { enc, sbTry } from '@/lib/crm/db'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function OldQuotation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [eb] = UUID.test(id) ? await sbTry<{ id: string }[]>(`eb_quotations?legacy_gb_id=eq.${enc(id)}&select=id&order=created_at.desc&limit=1`, []) : []
  redirect(eb ? `/eb/proposal/${eb.id}` : '/pricing-matrix')
}
