'use client'

/**
 * The work queue: every open case the case worker keeps, next thing to do first. A decision,
 * a reply ready to send, work with nothing prepared yet, and cases waiting on someone else.
 * Approving signs the draft as the person approving and sends it through /api/email/send.
 * Built for a phone first: one column of cards, buttons that fit a thumb.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn, Chip, Segmented, Spinner, Empty, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText, INK, MUTED, ERROR, selectCls } from '@/components/placement/shared'
import type { WorkItem, Lane } from '@/lib/casework/queue'

type Staff = { email: string; name: string }
type Who = 'mine' | 'unowned' | 'all'

const LANE: Record<Lane, string> = { decide: 'Decide', send: 'Ready to send', act: 'To act', waiting: 'Waiting' }
const TYPE: Record<string, string> = {
  claim: 'Claim', renewal: 'Renewal', new_quote: 'New quote', endorsement: 'Endorsement', member_movement: 'Member movement',
  premium_billing: 'Premium', documents: 'Documents', enquiry: 'Enquiry', other: 'Other',
}
const STATUS: Record<string, { label: string; tone: 'neutral' | 'amber' | 'green' | 'red' }> = {
  trs_to_act: { label: 'TRS to act', tone: 'amber' }, stalled: { label: 'Stalled', tone: 'red' },
  waiting_client: { label: 'Waiting on client', tone: 'neutral' }, waiting_insurer: { label: 'Waiting on insurer', tone: 'neutral' },
  done: { label: 'Done', tone: 'green' },
}

const days = (iso: string | null, today: string) => iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000) : null
const dueLabel = (d: number | null) => d === null ? null : d < 0 ? `${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

export default function WorkPage() {
  const [items, setItems] = useState<WorkItem[] | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [lane, setLane] = useState<Lane | 'all'>('all')
  const [who, setWho] = useState<Who>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(() => {
    callApi<{ items: WorkItem[]; staff: Staff[] }>('/api/work').then(d => { setItems(d.items); setStaff(d.staff) }).catch(e => setError(errText(e)))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { callApi<{ user?: { email?: string } | null }>('/api/auth/me').then(d => setMe(d.user?.email?.toLowerCase() ?? null)).catch(() => setMe(null)) }, [])

  const byWho = useMemo(() => (items ?? []).filter(i =>
    who === 'all' ? true : who === 'mine' ? i.owner_email === me : (!i.owner_email || i.owner_left)), [items, who, me])
  const count = (l: Lane) => byWho.filter(i => i.lane === l).length
  const shown = byWho.filter(i => lane === 'all' || i.lane === lane)

  return (
    <div className="px-4 md:px-8 py-6 max-w-[920px] mx-auto">
      <div className="flex flex-col gap-3 mb-5">
        <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em]">Work</h1>
        <div className="flex flex-wrap gap-2">
          <Segmented value={who} onChange={setWho} options={[
            { value: 'mine', label: 'Mine', count: (items ?? []).filter(i => i.owner_email === me).length },
            { value: 'unowned', label: 'No owner', count: (items ?? []).filter(i => !i.owner_email || i.owner_left).length },
            { value: 'all', label: 'Everyone', count: items?.length ?? 0 },
          ]} />
          <Segmented value={lane} onChange={setLane} options={[
            { value: 'all', label: 'All', count: byWho.length },
            ...(['decide', 'send', 'act', 'waiting'] as Lane[]).map(l => ({ value: l, label: LANE[l], count: count(l) })),
          ]} />
        </div>
      </div>
      {error && <p className="m-0 mb-3 text-[13.5px]" style={{ color: ERROR }}>{error}</p>}
      {notice && <p className="m-0 mb-3 text-[13.5px]" style={{ color: INK }}>{notice}</p>}
      {!items ? <Spinner label="Loading work…" /> : shown.length === 0 ? <Empty>Nothing here.</Empty> : (
        <div className="flex flex-col gap-3">
          {shown.map(i => <Card key={i.id} item={i} today={today} staff={staff} onDone={(msg) => { setNotice(msg); setError(null); load() }} onError={m => setError(m)} />)}
        </div>
      )}
    </div>
  )
}

function Card({ item: i, today, staff, onDone, onError }: { item: WorkItem; today: string; staff: Staff[]; onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [open, setOpen] = useState(i.lane === 'send' || i.lane === 'decide')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [to, setTo] = useState(i.draft?.to ?? '')
  const [cc, setCc] = useState(i.draft?.cc ?? '')
  const [subject, setSubject] = useState(i.draft?.subject ?? '')
  const [body, setBody] = useState(i.draft?.body ?? '')
  const due = dueLabel(days(i.deadline, today))
  const late = (days(i.deadline, today) ?? 1) < 0
  const st = STATUS[i.status] ?? STATUS.trs_to_act
  const client = i.company_name ?? i.client_name ?? 'Unfiled'
  const ownerName = staff.find(s => s.email === i.owner_email)?.name ?? i.owner_email

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label)
    try { onDone(await fn()) } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }
  const post = (body: unknown) => callApi<{ draftId?: string }>(`/api/work/${i.id}`, { method: 'POST', body })

  const send = () => run('send', async () => {
    if (editing) await post({ action: 'edit_draft', to, cc: cc || null, subject, body })
    const { draftId } = await post({ action: 'prepare_send' })
    await callApi('/api/email/send', { method: 'POST', body: { draftId } })
    await post({ action: 'sent' })
    return `Sent: ${i.title}.`
  })

  return (
    <article className="rounded-[10px] bg-white px-4 py-3.5" style={{ boxShadow: 'var(--card-shadow)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left bg-transparent border-0 p-0 cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] truncate" style={{ color: MUTED }}>{client}{i.insurer_name ? ` · ${i.insurer_name}` : ''}{i.policy_number ? ` · ${i.policy_number}` : ''}</div>
            <div className="text-[15.5px] font-medium leading-snug" style={{ color: INK }}>{i.title}</div>
          </div>
          {due && <span className="shrink-0 text-[12.5px] font-medium" style={{ color: late ? ERROR : MUTED }}>{due}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip tone={st.tone}>{st.label}</Chip>
          <Chip>{TYPE[i.case_type] ?? i.case_type}</Chip>
          {i.owner_left ? <Chip tone="red">Owner left</Chip> : ownerName ? <Chip>{ownerName}</Chip> : <Chip tone="amber">No owner</Chip>}
          {i.confidence === 'low' && <Chip tone="amber">Check facts</Chip>}
        </div>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 text-[14px]" style={{ color: INK }}>
          {i.summary && <p className="m-0" style={{ color: MUTED }}>{i.summary}</p>}
          {i.needs_human && (
            <div className="border-l-[3px] pl-3" style={{ borderColor: 'rgba(161,36,47,0.4)' }}>
              <div className="text-[12px] uppercase tracking-[0.04em]" style={{ color: ERROR }}>Decision needed</div>
              <div>{i.needs_human}</div>
            </div>
          )}
          {i.next_action && <div><span style={{ color: MUTED }}>Next: </span>{i.next_action}{i.deadline_basis ? <span style={{ color: MUTED }}> · {i.deadline_basis}</span> : null}</div>}

          {i.draft && (
            <div className="rounded-[8px] px-3 py-2.5" style={{ boxShadow: 'var(--card-shadow)' }}>
              {editing ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[12.5px]" style={{ color: MUTED }}>To<input className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></label>
                  <label className="text-[12.5px]" style={{ color: MUTED }}>Cc<input className={inputCls} value={cc} onChange={e => setCc(e.target.value)} /></label>
                  <label className="text-[12.5px]" style={{ color: MUTED }}>Subject<input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} /></label>
                  <textarea className={textareaCls} rows={10} value={body} onChange={e => setBody(e.target.value)} />
                </div>
              ) : (
                <>
                  <div className="text-[12.5px] break-words" style={{ color: MUTED }}>To {i.draft.to}{i.draft.cc ? ` · Cc ${i.draft.cc}` : ''}</div>
                  <div className="text-[13.5px] font-medium mt-0.5">{i.draft.subject}</div>
                  <pre className="m-0 mt-2 whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{i.draft.body.replace(/\{owner_name\}/g, 'Your name')}</pre>
                </>
              )}
              {i.draft.attachments.length > 0 && <div className="text-[12.5px] mt-2" style={{ color: MUTED }}>Attached: {i.draft.attachments.map(a => a.filename).join(', ')}</div>}
            </div>
          )}

          {i.threads.length > 0 && (
            <div className="text-[13px] flex flex-col gap-0.5">
              {i.threads.map(t => <Link key={t.id} href={`/engagement?thread=${t.id}`} className="no-underline hover:underline truncate" style={{ color: MUTED }}>{t.side === 'insurer' ? 'Insurer · ' : ''}{t.subject ?? 'Thread'}</Link>)}
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            {i.draft && <Btn level="primary" loading={busy === 'send'} disabled={busy !== null} onClick={() => void send()}>{editing ? 'Save and send' : 'Approve and send'}</Btn>}
            {i.draft && <Btn level="secondary" disabled={busy !== null} onClick={() => setEditing(e => !e)}>{editing ? 'Cancel edit' : 'Edit'}</Btn>}
            {i.draft && !editing && <Btn level="tertiary" disabled={busy !== null} onClick={() => void run('discard', async () => { await post({ action: 'discard_draft' }); return 'Draft discarded.' })}>Discard draft</Btn>}
            <select aria-label="Owner" className={`${selectCls} w-auto`} disabled={busy !== null} value={i.owner_left ? '' : i.owner_email ?? ''}
              onChange={e => e.target.value && void run('assign', async () => { await post({ action: 'assign', owner: e.target.value }); return `Assigned to ${staff.find(s => s.email === e.target.value)?.name ?? e.target.value}.` })}>
              <option value="">{i.owner_left || !i.owner_email ? 'Assign owner' : 'Change owner'}</option>
              {staff.map(s => <option key={s.email} value={s.email}>{s.name}{s.email === i.suggested_owner ? ' (suggested)' : ''}</option>)}
            </select>
            <Btn level="tertiary" disabled={busy !== null} onClick={() => void run('snooze', async () => { await post({ action: 'snooze', until: plusDays(3) }); return 'Back in 3 days.' })}>Not now</Btn>
            <Btn level="tertiary" disabled={busy !== null} onClick={() => void run('close', async () => { await post({ action: 'close' }); return `Closed: ${i.title}.` })}>Done</Btn>
          </div>
        </div>
      )}
    </article>
  )
}
