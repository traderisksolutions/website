'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Btn, Chip, SectionCard, Segmented, textareaCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterEmpty } from '@/components/ui/register'
import { applyMerge, firstNameOf, replySubject } from '@/lib/sales/render'
import { estimateSequence } from '@/lib/sales/schedule'
import { TEXT_LINK } from '@/lib/sales/rules'
import { CONTACT_STATUS_LABEL, fmtSlot, n } from '@/lib/sales/labels'
import type { CampaignContact } from '@/lib/sales/campaigns'

const INK = '#0f1412'
const MUTED = '#4a5550'
const RULE = '#e6e8e4'

type Step = { subject: string; body: string; delayDays: number }
type View = 'review' | 'scheduled' | 'done'

/** Every email this person will get, as they will read it. */
function render(c: CampaignContact, steps: Step[], links: { demo: string | null; deck: string | null; booking: string | null }) {
  const values = { first_name: c.first_name ?? firstNameOf(c.name), name: c.name, company: c.company, title: c.title, opening: c.opening, demo_link: links.demo, deck_link: links.deck, booking_link: links.booking }
  const out: { subject: string; body: string; error?: string }[] = []
  let first = ''
  steps.forEach((s, i) => {
    if (!s.body.trim()) return
    try {
      const subject = i === 0 ? applyMerge(s.subject, values) : replySubject(first || applyMerge(steps[0].subject, values))
      if (i === 0) first = subject
      out.push({ subject, body: applyMerge(s.body, values) })
    } catch (e) { out.push({ subject: '', body: '', error: e instanceof Error ? e.message : 'Cannot render' }) }
  })
  return out
}

/** The recipients: awaiting approval (with the opening a person can edit, and every email as it
 *  will read), scheduled, finished. Approval sets first-send times inside office hours. */
export function CampaignQueue({ campaignId, contacts, steps, links, active, sending, onChanged }: {
  campaignId: string; contacts: CampaignContact[]; steps: Step[]; links: { demo: string | null; deck: string | null; booking: string | null }; active: boolean; sending: boolean; onChanged: () => void
}) {
  const groups = useMemo(() => ({
    review: contacts.filter(c => c.status === 'review'),
    scheduled: contacts.filter(c => c.status === 'active' || c.status === 'pending'),
    done: contacts.filter(c => !['review', 'active', 'pending'].includes(c.status)),
  }), [contacts])
  const [view, setView] = useState<View>(groups.review.length ? 'review' : groups.scheduled.length ? 'scheduled' : 'done')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const delays = steps.slice(1).filter(s => s.body.trim()).map(s => s.delayDays)
  const usesOpening = /\{\{\s*opening\s*\}\}/i.test(steps[0]?.body ?? '')
  const rows = groups[view]

  async function approve(ids: string[] | null) {
    setBusy(true); setMsg('')
    const res = await fetch(`/api/sales/campaigns/${campaignId}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : { all: true }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(j.error ?? 'Could not approve'); return }
    setSelected(new Set())
    setMsg(j.approved ? `${n(j.approved)} approved · first emails ${fmtSlot(new Date(j.firstSend), 'SG')} to ${fmtSlot(new Date(j.lastSend), 'SG')} SGT` : 'Nothing to approve')
    onChanged()
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/sales/campaigns/contacts/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) setMsg(j.error ?? 'Could not update'); else onChanged()
  }

  return (
    <SectionCard title="Recipients" actions={
      <Segmented value={view} onChange={v => { setView(v); setSelected(new Set()) }}
        options={[{ value: 'review', label: 'Awaiting approval', count: groups.review.length }, { value: 'scheduled', label: 'Scheduled', count: groups.scheduled.length }, { value: 'done', label: 'Finished', count: groups.done.length }]} />
    }>
      {view === 'review' && groups.review.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Btn level="primary" size="xs" disabled={busy || selected.size === 0} loading={busy} onClick={() => approve(Array.from(selected))}>Approve {selected.size ? n(selected.size) : ''} selected</Btn>
          <Btn size="xs" disabled={busy} onClick={() => approve(null)}>Approve all {n(groups.review.length)}</Btn>
          <span className="text-[13px]" style={{ color: MUTED }}>{!active ? 'Campaign not active: approved emails wait for activation.' : !sending ? 'Sending off: approved emails wait until sending is on.' : ''}</span>
        </div>
      )}
      {msg && <p className="m-0 mb-3 text-[13.5px]" style={{ color: MUTED }} aria-live="polite">{msg}</p>}

      <Register label="Recipients" minWidth={820}>
        <RegisterHead>
          <RegisterTh first width={44}>{view === 'review' && <input type="checkbox" aria-label="Select all" className="size-4 accent-[#0f1412]" checked={rows.length > 0 && selected.size === rows.length} onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} />}</RegisterTh>
          <RegisterTh>Business</RegisterTh>
          <RegisterTh>Email</RegisterTh>
          <RegisterTh>Status</RegisterTh>
          <RegisterTh last hint="When each email is expected to go, in the recipient's local time">Schedule</RegisterTh>
        </RegisterHead>
        <tbody>
          {rows.length === 0 && <RegisterEmpty colSpan={5}>None</RegisterEmpty>}
          {rows.map(c => {
            const emails = render(c, steps, links)
            const firstAt = c.next_send_at ? new Date(c.next_send_at) : null
            const seq = c.status === 'active' && c.current_step === 0 && firstAt ? estimateSequence(firstAt, delays, c.location) : null
            const isOpen = open === c.id
            return (
              <Fragment key={c.id}>
                <tr style={{ borderBottom: `1px solid ${RULE}` }} className="hover:bg-[#faf9f6]">
                  <td className="pl-6 pr-2 py-3 align-top sticky left-0 bg-white z-10" style={{ boxShadow: 'inset -1px 0 0 #e6e8e4' }}>
                    {c.status === 'review' && <input type="checkbox" aria-label={`Select ${c.company ?? c.email}`} className="size-4 accent-[#0f1412]" checked={selected.has(c.id)} onChange={e => setSelected(s => { const x = new Set(s); if (e.target.checked) x.add(c.id); else x.delete(c.id); return x })} />}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-start gap-1.5 text-left bg-transparent border-0 p-0 cursor-pointer" aria-expanded={isOpen}>
                      {isOpen ? <ChevronDown size={14} className="mt-1 shrink-0" style={{ color: '#8c958f' }} /> : <ChevronRight size={14} className="mt-1 shrink-0" style={{ color: '#8c958f' }} />}
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium" style={{ color: INK }}>{c.company ?? '–'}</span>
                        <span className="block truncate text-[12.5px]" style={{ color: MUTED }}>{[c.name, c.location].filter(Boolean).join(' · ') || '–'}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 align-top text-[14px]"><p className="m-0 truncate" style={{ color: MUTED }} title={c.email}>{c.email}</p>{usesOpening && !c.opening && c.status === 'review' && <p className="m-0 mt-0.5 text-[12px]" style={{ color: '#8c958f' }}>No personal opening</p>}</td>
                  <td className="px-3 py-3 align-top"><Chip>{c.status === 'active' && c.current_step > 0 ? `Sent ${c.current_step} of ${emails.length}` : CONTACT_STATUS_LABEL[c.status] ?? c.status}</Chip></td>
                  <td className="px-3 pr-5 py-3 align-top text-[12.5px]" style={{ color: MUTED }}>
                    {seq ? seq.map((d, i) => <span key={i} className="block">Email {i + 1}: {fmtSlot(d, c.location)}</span>) : c.status === 'active' && firstAt ? <span>Next: {fmtSlot(firstAt, c.location)}</span> : c.status === 'review' ? 'Set on approval' : '–'}
                  </td>
                </tr>
                {isOpen && (
                  <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                    <td className="sticky left-0 bg-white z-10" />
                    <td colSpan={4} className="px-3 pr-5 pb-4">
                      <div className="flex flex-col gap-3">
                        {usesOpening && c.status === 'review' && (
                          <label className="grid gap-1 text-[12.5px]" style={{ color: MUTED }}>Personal opening (Email 1)
                            <textarea defaultValue={c.opening ?? ''} rows={2} maxLength={400} onBlur={e => { if ((e.target.value || '') !== (c.opening ?? '')) patch(c.id, { action: 'opening', opening: e.target.value }) }} className={textareaCls} />
                            {c.opening_source === 'draft' && <span style={{ color: '#8c958f' }}>From the lead tool&apos;s draft</span>}
                          </label>
                        )}
                        {emails.map((e, i) => (
                          <article key={i} className="rounded-[10px] p-4" style={{ border: `1px solid ${RULE}` }}>
                            <p className="m-0 text-[12px]" style={{ color: '#8c958f' }}>Email {i + 1}{seq?.[i] ? ` · ${fmtSlot(seq[i], c.location)}` : ''}</p>
                            {e.error ? <p className="m-0 mt-1 text-[14px]">{e.error}</p> : <><p className="m-0 mt-1 text-[14px] font-medium">{e.subject}</p><p className="m-0 mt-2 max-w-[65ch] whitespace-pre-wrap text-[14px] leading-relaxed"><LinkedText text={e.body} /></p></>}
                          </article>
                        ))}
                        <div className="flex gap-3 text-[13.5px]">
                          {c.current_step === 0 && ['review', 'pending', 'active'].includes(c.status) && <button type="button" onClick={() => patch(c.id, { action: 'remove' })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2" style={{ color: MUTED }}>Remove from campaign</button>}
                          {c.current_step > 0 && c.status === 'active' && <button type="button" onClick={() => patch(c.id, { action: 'replied' })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2" style={{ color: MUTED }}>Mark replied</button>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </Register>
    </SectionCard>
  )
}

/** Shows [label](url) as a link on the label, the way the email will. */
function LinkedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of Array.from(text.matchAll(TEXT_LINK))) {
    parts.push(text.slice(last, m.index))
    parts.push(<a key={m.index} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: '#1f4e3a' }}>{m[1]}</a>)
    last = (m.index ?? 0) + m[0].length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}
