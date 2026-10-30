'use client'

import { PlacementPanel } from '@/components/placement/PlacementPanel'
import type { CompanyThread, QuoteRow } from '@/lib/crm/types'
import type { LinePosition, PlacementBundle } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'

/**
 * The Quotes tab: the placements taken to market, one dense grid each. The Pricing Matrix
 * quotation register (CompanyQuotation) no longer renders here; `quotes` still feeds the tab count
 * on the company page.
 */
export function CompanyQuotes({ companyId, companyName, threads, data, policies, onChanged, onOpenDrafts }: {
  companyId: string
  companyName: string
  quotes: QuoteRow[]
  threads: CompanyThread[]
  data: { bundle: PlacementBundle; positions: LinePosition[] } | null
  policies: PolicyView[] | null
  onChanged: () => void
  onOpenDrafts: (focus?: string) => void
}) {
  return <PlacementPanel companyId={companyId} companyName={companyName} threads={threads} data={data} policies={policies} onChanged={onChanged} onOpenDrafts={onOpenDrafts} />
}
