'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Btn, Segmented } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'

type Tab = 'ledger' | 'renewal'

/** Ledger | Renewal, kept in the URL so the page stays server-rendered. */
export function PolicyTabs({ value }: { value: Tab }) {
  const router = useRouter()
  const pathname = usePathname()
  return <Segmented<Tab> value={value} onChange={v => router.push(`${pathname}?tab=${v}`)} options={[{ value: 'ledger', label: 'Ledger' }, { value: 'renewal', label: 'Renewal' }]} label="View" />
}

/** The report as it would go to the client, opened in a new tab. Secondary, beside the one primary. */
export function ReportLink({ policyId }: { policyId: string }) {
  return <a href={`/api/policies/${policyId}/renewal/report`} target="_blank" rel="noreferrer" className="inline-flex items-center h-9 px-3.5 rounded-[7px] text-[14px] font-medium no-underline bg-white text-trs-ink border border-trs-line-2 hover:border-trs-ink">Open report PDF</a>
}

/** The page's one primary: the report and its email become a draft on Today for a person to send. */
export function RenewalAdviceButton({ policyId }: { policyId: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ work_item_id: string; to: string | null; draft_id: string | null; reason?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (done) {
    return <Link href={`/today/${done.work_item_id}`} className="inline-flex items-center h-9 px-3.5 rounded-[7px] text-[14px] font-medium no-underline bg-trs-select-bg text-trs-select-fg hover:underline">{done.draft_id ? `Draft on Today${done.to ? ` · to ${done.to}` : ' · no recipient on file'}` : `Case on Today · ${done.reason ?? 'report not made'}`} →</Link>
  }
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-[12.5px] text-trs-neg">{error}</span>}
      <Btn level="primary" loading={busy} onClick={async () => {
        setBusy(true); setError(null)
        try { setDone(await callApi<{ work_item_id: string; draft_id: string | null; to: string | null; reason?: string }>(`/api/policies/${policyId}/renewal`, { method: 'POST', body: { action: 'draft' } })) }
        catch (e) { setError(errText(e)) }
        finally { setBusy(false) }
      }}>Draft renewal advice</Btn>
    </span>
  )
}
