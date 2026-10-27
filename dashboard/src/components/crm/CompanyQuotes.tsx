'use client'

import { PlacementPanel } from '@/components/placement/PlacementPanel'
import { CompanyQuotation } from './CompanyQuotation'
import type { CompanyThread, QuoteRow } from '@/lib/crm/types'
import type { LinePosition, PlacementBundle } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'

/** The Quotes tab: placements taken to market on top, Employment benefits quotations below. */
export function CompanyQuotes({ companyId, companyName, quotes, threads, data, policies, onChanged, onOpenDrafts }: {
  companyId: string
  companyName: string
  quotes: QuoteRow[]
  threads: CompanyThread[]
  data: { bundle: PlacementBundle; positions: LinePosition[] } | null
  policies: PolicyView[] | null
  onChanged: () => void
  onOpenDrafts: () => void
}) {
  return (
    <>
      <PlacementPanel companyId={companyId} companyName={companyName} threads={threads} data={data} policies={policies} onChanged={onChanged} onOpenDrafts={onOpenDrafts} />
      <CompanyQuotation companyId={companyId} companyName={companyName} quotes={quotes} />
    </>
  )
}
