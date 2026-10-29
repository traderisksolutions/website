'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import type { CampaignRow, CampaignCounts } from '@/lib/sales/campaigns'
import type { WorkflowStatus } from '@/lib/sales/config'
import { CAMPAIGN_STATUS_LABEL, FIRST_TOUCH_LABEL, audienceSummary, n } from '@/lib/sales/labels'

const INK = '#0f1412'
const MUTED = '#4a5550'

type Payload = { campaigns: (CampaignRow & { counts: CampaignCounts })[]; workflow: WorkflowStatus; alias: { mailbox: string | null; verified: boolean } | null }

/** Campaigns: a sequence of emails to an audience, sent as the sales address within the daily
 *  cap. Each recipient is approved by a person before anything is scheduled. */
export default function CampaignsPage() {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sales/campaigns', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not load campaigns')
      setData(j); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const wf = data?.workflow
  const totals = data?.campaigns.reduce((t, c) => ({ sent: t.sent + c.counts.sent, replied: t.replied + c.counts.replied, review: t.review + c.counts.review }), { sent: 0, replied: 0, review: 0 })
  const sendState = !wf ? '' : wf.sending ? 'on' : wf.gmail ? 'off (CAMPAIGN_SENDING_ENABLED is not true)' : 'off (Gmail not connected)'
  const aliasNote = data?.alias && !data.alias.verified ? `${wf?.sender} is not a verified "Send mail as" alias on ${data.alias.mailbox ?? 'the connected mailbox'}: Gmail would send as the mailbox instead.` : null

  return (
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Campaigns</h1>
              <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
                {!data ? 'Loading…' : <>{n(data.campaigns.length)} campaigns · {n(totals!.review)} awaiting approval · {n(totals!.sent)} sent · {n(totals!.replied)} replied</>}
              </p>
              {wf && <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>Sends as {wf.sender} · sending {sendState} · {n(wf.dailyCap)} emails a day, Mon–Fri 09:00–17:00 local</p>}
              {aliasNote && <p className="m-0 mt-1 text-[13.5px]" style={{ color: INK }} role="status">{aliasNote}</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap pb-2">
              <Button size="lg" disabled={creating} onClick={async () => {
                setCreating(true)
                try {
                  const res = await fetch('/api/sales/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
                  const j = await res.json().catch(() => ({}))
                  if (res.ok && j.id) router.push(`/sales/campaigns/${j.id}`)
                } finally { setCreating(false) }
              }}>{creating ? 'Creating…' : 'New campaign'}</Button>
            </div>
          </div>
          <div className="mt-5 pb-4" style={{ borderBottom: '1px solid #e6e8e4' }} />
        </div>

        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>
          {error && <p className="m-0 mb-4 text-[14px]" role="alert">{error}</p>}
          <Register label="Campaigns" minWidth={860}>
            <RegisterHead>
              <RegisterTh first>Campaign</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh hint="Who the campaign writes to">Audience</RegisterTh>
              <RegisterTh align="right" hint="Recipients waiting for a person to approve">Awaiting approval</RegisterTh>
              <RegisterTh align="right" hint="Scheduled or mid-sequence">In sequence</RegisterTh>
              <RegisterTh align="right">Sent</RegisterTh>
              <RegisterTh align="right" last>Replied</RegisterTh>
            </RegisterHead>
            <tbody>
              {!data ? null : data.campaigns.length === 0 ? <RegisterEmpty colSpan={7}>No campaigns yet.</RegisterEmpty> : data.campaigns.map(c => (
                <RegisterRow key={c.id} onClick={() => router.push(`/sales/campaigns/${c.id}`)}>
                  <RegisterCell first identityWidth={260} primary={c.name} secondary={`First email: ${FIRST_TOUCH_LABEL[c.first_touch]}`} />
                  <RegisterCell><Chip>{CAMPAIGN_STATUS_LABEL[c.status]}</Chip></RegisterCell>
                  <RegisterCell nowrap={false}><span className="text-[13.5px]" style={{ color: MUTED }}>{audienceSummary(c.audience)}</span></RegisterCell>
                  <RegisterCell align="right"><span className="tabular-nums">{n(c.counts.review)}</span></RegisterCell>
                  <RegisterCell align="right"><span className="tabular-nums">{n(c.counts.active + c.counts.pending)}</span></RegisterCell>
                  <RegisterCell align="right"><span className="tabular-nums">{n(c.counts.sent)}</span></RegisterCell>
                  <RegisterCell align="right" last><span className="tabular-nums">{n(c.counts.replied)}</span></RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </div>
      </AppMainPanel>
    </AppSplitLayout>
  )
}
