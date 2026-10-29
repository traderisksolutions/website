'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { CampaignEditor, type CampaignData } from '@/components/sales/CampaignEditor'

const MUTED = '#4a5550'

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CampaignData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/campaigns/${id}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not load the campaign')
      setData(j); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { void load() }, [load])

  return (
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">
        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-8 pb-16">
          {error && <p className="m-0 text-[14px]" role="alert">{error}</p>}
          {!data && !error && <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p>}
          {data && <CampaignEditor key={data.campaign.updated_at} data={data} onChanged={load} />}
        </div>
      </AppMainPanel>
    </AppSplitLayout>
  )
}
