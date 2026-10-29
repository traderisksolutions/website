'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Btn, Chip, Field, SectionCard, Segmented, inputCls, textareaCls } from '@/components/crm/primitives'
import { CampaignQueue } from './CampaignQueue'
import type { CampaignContact, CampaignCounts, CampaignRow, StepRow } from '@/lib/sales/campaigns'
import type { WorkflowStatus } from '@/lib/sales/config'
import { CAMPAIGN_STATUS_LABEL, n } from '@/lib/sales/labels'

const INK = '#0f1412'
const MUTED = '#4a5550'

export type CampaignData = { campaign: CampaignRow; steps: StepRow[]; contacts: CampaignContact[]; counts: CampaignCounts; workflow: WorkflowStatus }
type StepState = { subject: string; body: string; delayDays: number }

const STEP_COUNT = 3
const LOCATIONS = ['SG', 'MY', 'ID', 'HK']
const MERGE_HELP = 'Fields: {{first_name}} {{name}} {{company}} {{title}} {{opening}} {{demo_link}} {{deck_link}} {{booking_link}}. Empty contact fields fall back to a neutral word. A link that is not set blocks activation. Follow-ups go into the first email\'s thread under its subject. A sender line and unsubscribe link are added to every email.'

export function CampaignEditor({ data, onChanged }: { data: CampaignData; onChanged: () => void }) {
  const { campaign, counts, workflow } = data
  const [name, setName] = useState(campaign.name)
  const [fromName, setFromName] = useState(campaign.from_name)
  const [firstTouch, setFirstTouch] = useState<'template' | 'personal_draft'>(campaign.first_touch)
  const [demoUrl, setDemoUrl] = useState(campaign.demo_url ?? '')
  const [deckUrl, setDeckUrl] = useState(campaign.deck_url ?? '')
  const [bookingUrl, setBookingUrl] = useState(campaign.booking_url ?? '')
  const [autoEnrol, setAutoEnrol] = useState(Boolean(campaign.auto_enrol))
  const [autoApprove, setAutoApprove] = useState(Boolean(campaign.auto_approve))
  const [dailyNew, setDailyNew] = useState(campaign.daily_new ?? 10)
  const [relationships, setRelationships] = useState<string[]>(campaign.audience?.relationships ?? [])
  const [locations, setLocations] = useState<string[]>(campaign.audience?.locations ?? [])
  const [verifiedOnly, setVerifiedOnly] = useState(Boolean(campaign.audience?.verifiedOnly))
  const [namedOnly, setNamedOnly] = useState(Boolean(campaign.audience?.namedOnly))
  const [steps, setSteps] = useState<StepState[]>(() => Array.from({ length: STEP_COUNT }, (_, i) => {
    const s = data.steps.find(x => x.step_number === i + 1)
    return { subject: s?.subject ?? '', body: s?.body ?? '', delayDays: s?.delay_days ?? (i === 0 ? 0 : i === 1 ? 2 : 4) }
  }))
  const [preview, setPreview] = useState<{ matching: number; available: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const personal = firstTouch === 'personal_draft'
  const audience = { relationships, locations, verifiedOnly, namedOnly }

  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch('/api/sales/campaigns/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audience }), signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null)).then(j => j && setPreview(j)).catch(() => {})
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationships, locations, verifiedOnly, namedOnly])

  async function save(status?: string) {
    setBusy(status ?? 'save'); setError(''); setNote('')
    try {
      const res = await fetch(`/api/sales/campaigns/${campaign.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        name, fromName, firstTouch, demoUrl: demoUrl.trim() || null, deckUrl: deckUrl.trim() || null, bookingUrl: bookingUrl.trim() || null, audience, autoEnrol, autoApprove, dailyNew,
        steps: steps.map((s, i) => ({ stepNumber: i + 1, ...s })).filter(s => !(personal && s.stepNumber === 1)), ...(status ? { status } : {}),
      }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not save'); return false }
      setNote(status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Saved')
      onChanged()
      return true
    } finally { setBusy(null) }
  }

  async function enrol() {
    if (!(await save())) return
    setBusy('enrol')
    try {
      const res = await fetch(`/api/sales/campaigns/${campaign.id}/enrol`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not add contacts'); return }
      setNote(`${n(j.added)} added for approval`); onChanged()
    } finally { setBusy(null) }
  }

  const active = campaign.status === 'active'
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  return (
    <div style={{ color: INK }}>
      <Link href="/sales/campaigns" className="inline-flex items-center gap-1 text-[13.5px] no-underline hover:underline" style={{ color: MUTED }}><ChevronLeft size={14} /> Campaigns</Link>
      <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em] leading-[1.1] truncate">{campaign.name}</h1>
            <Chip>{CAMPAIGN_STATUS_LABEL[campaign.status]}</Chip>
          </div>
          <p className="m-0 mt-2 text-[14.5px]" style={{ color: MUTED }}>
            {n(counts.review)} awaiting approval · {n(counts.active + counts.pending)} scheduled or in sequence · {n(counts.sent)} sent · {n(counts.replied)} replied · {n(counts.bounced)} bounced · {n(counts.unsubscribed)} unsubscribed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap pb-1">
          {note && <span className="text-[13.5px]" style={{ color: MUTED }} aria-live="polite">{note}</span>}
          <Btn disabled={!!busy} loading={busy === 'save'} onClick={() => save()}>Save</Btn>
          {active ? <Btn level="primary" disabled={!!busy} loading={busy === 'paused'} onClick={() => save('paused')}>Pause</Btn> : <Btn level="primary" disabled={!!busy} loading={busy === 'active'} onClick={() => save('active')}>Activate</Btn>}
        </div>
      </div>
      {campaign.paused_reason && campaign.status === 'paused' && <p className="m-0 mt-4 text-[14px]" role="status">{campaign.paused_reason}</p>}
      {error && <p className="m-0 mt-4 text-[14px]" role="alert">{error}</p>}

      <div className="mt-6">
        <SectionCard title="Campaign">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} maxLength={120} className={inputCls} /></Field>
            <Field label="From name"><input value={fromName} onChange={e => setFromName(e.target.value)} maxLength={80} className={inputCls} /></Field>
          </div>
          <div className="mt-4 grid gap-1 text-[13.5px]" style={{ color: MUTED }}>
            <p className="m-0">Sends as {workflow.sender}, with a copy to the same inbox.</p>
            <p className="m-0">Sending {workflow.sending ? 'on' : workflow.gmail ? 'off: CAMPAIGN_SENDING_ENABLED is not true' : 'off: Gmail not connected'} · {n(workflow.dailyCap)} emails a day across all campaigns, Mon–Fri 09:00–17:00 local.</p>
          </div>
        </SectionCard>

        <SectionCard title="Links">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Demo link"><input value={demoUrl} onChange={e => setDemoUrl(e.target.value)} placeholder="https://" inputMode="url" className={inputCls} /></Field>
            <Field label="Deck link" hint="Goes as a link, not an attachment."><input value={deckUrl} onChange={e => setDeckUrl(e.target.value)} placeholder="https://" inputMode="url" className={inputCls} /></Field>
            <Field label="Booking link"><input value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://" inputMode="url" className={inputCls} /></Field>
          </div>
        </SectionCard>

        <SectionCard title="Audience">
          <div className="flex flex-col gap-4">
            <Field label="First email">
              <Segmented value={firstTouch} onChange={setFirstTouch} options={[{ value: 'template', label: 'Template below' }, { value: 'personal_draft', label: 'Approved personal draft' }]} />
            </Field>
            {personal ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>People join when their draft is approved on the Leads page.</p> : (
              <>
                <Field label="Who">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Relationship">
                    {[['prospect', 'Prospects'], ['client', 'Clients'], ['enquiry', 'Enquiries'], ['other', 'Imported']].map(([v, l]) => (
                      <button key={v} type="button" aria-pressed={relationships.includes(v)} onClick={() => setRelationships(toggle(relationships, v))} className={`filter-pill ${relationships.includes(v) ? 'active' : ''}`}>{l}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Market">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Market">
                    {LOCATIONS.map(l => <button key={l} type="button" aria-pressed={locations.includes(l)} onClick={() => setLocations(toggle(locations, l))} className={`filter-pill ${locations.includes(l) ? 'active' : ''}`}>{l}</button>)}
                  </div>
                </Field>
                <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} className="size-4 accent-[#0f1412]" /> Verified emails only (otherwise verified or published on the company&apos;s site)</label>
                <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={namedOnly} onChange={e => setNamedOnly(e.target.checked)} className="size-4 accent-[#0f1412]" /> Named people only (no info@, sales@, enquiries@)</label>
                <div className="flex flex-col gap-2 pt-3" style={{ borderTop: '1px solid #e6e8e4' }}>
                  <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={autoEnrol} onChange={e => setAutoEnrol(e.target.checked)} className="size-4 accent-[#0f1412]" /> Add new matching businesses every weekday at 08:00 SGT</label>
                  <label className="flex flex-wrap items-center gap-2 text-[14px]" style={{ color: autoEnrol ? INK : '#8c958f' }}>
                    <input type="checkbox" checked={autoApprove} disabled={!autoEnrol} onChange={e => setAutoApprove(e.target.checked)} className="size-4 accent-[#0f1412]" /> Approve them automatically, up to
                    <input type="number" min={0} max={100} value={dailyNew} disabled={!autoEnrol || !autoApprove} onChange={e => setDailyNew(Number(e.target.value) || 0)} className={`${inputCls} h-8 w-16 px-2 text-[13px]`} aria-label="New businesses per day" /> a day
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13.5px] tabular-nums" style={{ color: MUTED }}>{preview ? `${n(preview.matching)} match · ${n(preview.available)} free to add` : 'Counting…'}</span>
                  <Btn size="xs" disabled={!!busy || !preview?.available} loading={busy === 'enrol'} onClick={enrol} title="Not free: in another campaign now, or emailed by any campaign in the last 90 days.">Add {preview ? n(preview.available) : ''} contacts for approval</Btn>
                </div>
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Emails" actions={<span className="text-[12.5px]" style={{ color: MUTED }} title={MERGE_HELP}>Merge fields (?)</span>}>
          <div className="flex flex-col gap-5">
            {steps.map((s, i) => (
              <div key={i} className={i ? 'pt-5' : ''} style={i ? { borderTop: '1px solid #e6e8e4' } : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-[14px] font-medium">Email {i + 1}</h3>
                  {i > 0 && (
                    <label className="flex items-center gap-2 text-[13.5px]" style={{ color: MUTED }}>
                      <input type="number" min={0} max={60} value={s.delayDays} onChange={e => setSteps(p => p.map((x, j) => (j === i ? { ...x, delayDays: Number(e.target.value) || 0 } : x)))} className={`${inputCls} h-8 w-16 px-2 text-[13px]`} aria-label={`Days before email ${i + 1}`} /> days after email {i}
                    </label>
                  )}
                </div>
                {i === 0 && personal ? <p className="m-0 mt-2 text-[14px]" style={{ color: MUTED }}>Each person&apos;s approved draft from the Leads page, as written.</p> : (
                  <div className="mt-2 flex flex-col gap-2">
                    {i === 0 ? <input value={s.subject} placeholder="Subject" maxLength={200} aria-label="Email 1 subject" onChange={e => setSteps(p => p.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} className={inputCls} />
                      : <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Subject: Re: first email&apos;s subject</p>}
                    <textarea value={s.body} rows={8} maxLength={10000} aria-label={`Email ${i + 1} message`} placeholder={i === 0 ? 'Hi {{first_name}},' : 'Leave empty to stop after the previous email'} onChange={e => setSteps(p => p.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} className={textareaCls} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        <CampaignQueue campaignId={campaign.id} contacts={data.contacts} steps={personal ? steps.map((x, i) => (i === 0 ? { ...x, body: '' } : x)) : steps}
          links={{ demo: demoUrl.trim() || null, deck: deckUrl.trim() || null, booking: bookingUrl.trim() || null }} active={active} sending={workflow.sending} onChanged={onChanged} />
      </div>
    </div>
  )
}
