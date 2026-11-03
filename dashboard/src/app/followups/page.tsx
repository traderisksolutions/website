'use client'

/**
 * Follow-ups: every email TRS sent that waits on a reply, by type, and when it is chased next.
 * The chase is set on Today when the email is approved; emails sent from Gmail get the default.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Btn, Chip, Segmented, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { TYPE_LABEL, type EmailType } from '@/lib/followups/rules'

type Row = { id: string; thread_id: string | null; work_item_id: string | null; sent_at: string; sent_by: string | null; to_party: string; to_email: string | null; subject: string | null; email_type: EmailType; status: string; chases: number; max_chases: number; next_chase_at: string | null; replied_at: string | null; set_by: string; preapproved: boolean }
type Sum = { type: string; label: string; waiting: number; overdue: number; replied: number; chased_out: number; median_reply_days: number | null }
const day = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '–'
const STATUS: Record<string, string> = { waiting: 'Waiting', chased_out: 'No reply after chases', replied: 'Replied', superseded: 'Superseded', off: 'No chase', not_needed: 'No reply needed' }

export default function FollowupsPage() {
  const [data, setData] = useState<{ rows: Row[]; summary: Sum[] } | null>(null)
  const [view, setView] = useState<'open' | 'all'>('open')
  const [type, setType] = useState<string>('')
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/followups${view === 'all' ? '?status=all' : ''}`, { cache: 'no-store' }); const j = await r.json()
    if (!r.ok) setMsg(j.error ?? 'Could not load'); else setData(j)
  }, [view])
  useEffect(() => { void load() }, [load])
  async function stop(id: string) { await fetch('/api/followups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'off' }) }); await load() }
  if (!data) return <div className="px-4 md:px-8 py-6"><Spinner label={msg ?? 'Loading follow-ups'} /></div>
  const now = Date.now()
  const rows = data.rows.filter(r => !type || r.email_type === type)
  const overdue = data.rows.filter(r => r.status === 'waiting' && r.next_chase_at && Date.parse(r.next_chase_at) < now).length
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1180px] mx-auto flex flex-col gap-6">
      <PageHeader title="Follow-ups" meta={`${data.rows.filter(r => r.status === 'waiting').length} waiting · ${overdue} due for a chase · last 60 days`} />
      <section className="min-w-0">
        <h2 className="m-0 mb-2 text-[15px] font-semibold">By type</h2>
        <Register label="Follow-ups by type" minWidth={720}>
          <RegisterHead><RegisterTh first>Type</RegisterTh><RegisterTh align="right">Waiting</RegisterTh><RegisterTh align="right">Due</RegisterTh><RegisterTh align="right">Replied</RegisterTh><RegisterTh align="right">No reply after chases</RegisterTh><RegisterTh last align="right">Median days to reply</RegisterTh></RegisterHead>
          <tbody>
            {data.summary.length === 0 && <RegisterEmpty colSpan={6}>No sent email is waiting on a reply.</RegisterEmpty>}
            {data.summary.map(s => (
              <RegisterRow key={s.type}>
                <RegisterCell first><button type="button" onClick={() => setType(type === s.type ? '' : s.type)} className="bg-transparent border-0 p-0 cursor-pointer text-left text-trs-ink hover:underline">{s.label}</button></RegisterCell>
                <RegisterCell align="right">{s.waiting}</RegisterCell><RegisterCell align="right">{s.overdue}</RegisterCell><RegisterCell align="right">{s.replied}</RegisterCell>
                <RegisterCell align="right">{s.chased_out}</RegisterCell><RegisterCell last align="right">{s.median_reply_days ?? '–'}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      </section>
      <section className="min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<'open' | 'all'> value={view} onChange={setView} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
          {type && <Chip>{TYPE_LABEL[type as EmailType] ?? type} <button type="button" aria-label="Clear type" onClick={() => setType('')} className="bg-transparent border-0 p-0 cursor-pointer">×</button></Chip>}
        </div>
        <Register label="Follow-ups" minWidth={980}>
          <RegisterHead><RegisterTh first width={80}>Sent</RegisterTh><RegisterTh>Email</RegisterTh><RegisterTh width={170}>Type</RegisterTh><RegisterTh width={150}>Status</RegisterTh><RegisterTh width={120}>Next chase</RegisterTh><RegisterTh last align="right" width={90}> </RegisterTh></RegisterHead>
          <tbody>
            {rows.length === 0 && <RegisterEmpty colSpan={6}>Nothing here.</RegisterEmpty>}
            {rows.map(r => (
              <RegisterRow key={r.id}>
                <RegisterCell first primary={day(r.sent_at)} />
                <RegisterCell title={r.subject ?? ''}>
                  {r.work_item_id ? <Link href={`/today/${r.work_item_id}`} className="no-underline hover:underline text-trs-ink">{r.subject}</Link> : <Link href={`/engagement?lead=${r.thread_id}`} className="no-underline hover:underline text-trs-ink">{r.subject}</Link>}
                  <div className="text-[12px] text-trs-muted truncate">To {r.to_party === 'insurer' ? 'insurer' : r.to_party === 'client' ? 'client' : ''} {r.to_email} · by {r.sent_by?.split('@')[0]}{r.set_by !== 'rule' ? ' · chase set by hand' : ''}{r.preapproved ? ' · sends without asking' : ''}</div>
                </RegisterCell>
                <RegisterCell>{TYPE_LABEL[r.email_type] ?? r.email_type}</RegisterCell>
                <RegisterCell><Chip tone={r.status === 'chased_out' ? 'red' : r.status === 'waiting' && r.next_chase_at && Date.parse(r.next_chase_at) < now ? 'amber' : 'neutral'}>{STATUS[r.status] ?? r.status}{r.chases ? ` · ${r.chases} of ${r.max_chases}` : ''}</Chip></RegisterCell>
                <RegisterCell>{r.status === 'waiting' ? day(r.next_chase_at) : r.replied_at ? `Replied ${day(r.replied_at)}` : '–'}</RegisterCell>
                <RegisterCell last align="right">{r.status === 'waiting' && <Btn size="xs" level="tertiary" onClick={() => void stop(r.id)}>Stop</Btn>}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      </section>
    </div>
  )
}
