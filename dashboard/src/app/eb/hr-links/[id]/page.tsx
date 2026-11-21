'use client'

import { Breadcrumbs } from '@/components/nav/Breadcrumbs'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Btn } from '@/components/crm/primitives'
import { HrModal } from '@/components/group-benefits/hr/HrModal'
import type { HrLink, HrLinkEvent, HrSubmission, HrEmployee, HrDependant } from '@/lib/hr/types'
import {
  CHIP, EVENT_LABEL, MIGRATION_PENDING_LINE, RELATIONSHIP_LABEL, SOURCE_LABEL,
  eventSentence, fmtDate, fmtDateTime, fmtDob, linkIsOpen, linkStatusWord, type HrLinkDetailResponse,
} from '@/components/group-benefits/hr/labels'


type ListRow = {
  key: string; name: string; relationship: 'self' | 'spouse' | 'child'; parent: string | null
  category: string | null; dob: string | null; workPass: string | null; issues: string[]; inactive: boolean
}

/** Employees in order, each followed by its dependants. */
function flatten(employees: HrEmployee[], dependants: HrDependant[]): ListRow[] {
  const out: ListRow[] = []
  const seen = new Set<string>()
  for (const e of employees) {
    out.push({ key: `e:${e.key}`, name: e.name, relationship: 'self', parent: null, category: e.category, dob: e.dob, workPass: e.workPass, issues: e.issues ?? [], inactive: e.status === 'inactive' })
    for (const d of dependants.filter(d => d.employeeKey === e.key)) {
      seen.add(d.key)
      out.push({ key: `d:${d.key}`, name: d.name, relationship: d.relationship, parent: e.name, category: null, dob: d.dob, workPass: null, issues: d.issues ?? [], inactive: false })
    }
  }
  for (const d of dependants.filter(d => !seen.has(d.key))) {
    out.push({ key: `d:${d.key}`, name: d.name, relationship: d.relationship, parent: null, category: null, dob: d.dob, workPass: null, issues: [...(d.issues ?? []), 'Employee not found in the list'], inactive: false })
  }
  return out
}

/**
 * One HR link: its facts, the list HR provided, and what happened to the link and when.
 * `Quote from this list` opens Quick quote with the census filled in from the submission.
 */
export default function HrLinkPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [link, setLink] = useState<HrLink | null>(null)
  const [events, setEvents] = useState<HrLinkEvent[]>([])
  const [submission, setSubmission] = useState<HrSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'resend' | 'close' | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/hr-links/${id}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({})) as HrLinkDetailResponse
      if (d.migrationPending) { setPending(true); return }
      if (!res.ok || !d.link) { setError(d.error ?? (res.status === 404 ? 'This link does not exist.' : `Could not load the link (${res.status}).`)); return }
      setLink(d.link); setEvents(d.events ?? []); setSubmission(d.submission ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the link.')
    } finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function act(kind: 'resend' | 'close') {
    setConfirmClose(false)
    setBusy(kind); setNotice(null); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/hr-links/${id}/${kind}`, { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { error?: string; mailError?: string }
      if (!res.ok) { setError(d.error ?? `Could not ${kind === 'resend' ? 'resend' : 'close'} (${res.status}).`); return }
      setNotice(kind === 'resend'
        ? (d.mailError ? `New link issued; the email did not send: ${d.mailError}` : `Resent to ${link?.recipient_email ?? 'HR'}.`)
        : 'Link closed.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.')
    } finally { setBusy(null) }
  }

  const rows = useMemo(() => submission ? flatten(submission.employees ?? [], submission.dependants ?? []) : [], [submission])
  const counts = useMemo(() => {
    const employees = rows.filter(r => r.relationship === 'self' && !r.inactive).length
    const spouses = rows.filter(r => r.relationship === 'spouse').length
    const children = rows.filter(r => r.relationship === 'child').length
    const missingDob = rows.filter(r => !r.dob && !r.inactive).length
    const inactive = rows.filter(r => r.inactive).length
    return { employees, spouses, children, lives: employees + spouses + children, missingDob, inactive }
  }, [rows])

  const submitted = submission?.status === 'submitted'
  const sourceWord = submission ? (SOURCE_LABEL[submission.source] ?? submission.source) : null
  const sourceFile = typeof submission?.source_meta?.filename === 'string' ? submission.source_meta.filename as string : null

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink" >
    <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
      <Breadcrumbs className="mb-3" current={{ label: 'Employee list', href: `/eb/hr-links/${id}` }} fallback={{ label: 'Employee lists', href: '/eb/quotations?tab=hrlinks' }} />

      {pending && <p className="m-0 py-10 text-body text-trs-muted" >{MIGRATION_PENDING_LINE}</p>}
      {loading && !pending && <p className="m-0 py-10 text-center text-body text-trs-muted" >Loading…</p>}
      {!loading && !pending && error && !link && <p className="m-0 py-10 text-body text-trs-neg" >{error}</p>}

      {link && (
        <>
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="m-0 text-title font-semibold leading-[1.08]">{link.company_name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Btn level="secondary" onClick={() => act('resend')} loading={busy === 'resend'} disabled={busy !== null || link.status === 'submitted'}>Resend</Btn>
                <Btn level="secondary" onClick={() => setConfirmClose(true)} loading={busy === 'close'} disabled={busy !== null || !linkIsOpen(link)}>Close link</Btn>
                <Btn level="primary" onClick={() => router.push(`/eb?hrLink=${link.id}`)} disabled={!submitted}>Quote from this list</Btn>
              </div>
            </div>
            <p className="m-0 mt-2 text-body tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1 text-trs-muted" >
              <span className="font-medium text-trs-ink" >{link.reference}</span>
              <span className={CHIP}>{linkStatusWord(link)}</span>
              <span>· to {link.recipient_name}, {link.recipient_email}</span>
              {link.cc_email && <span>· copy {link.cc_email}</span>}
              {link.requested_by && <span>· requested by {link.requested_by}</span>}
              <span>· {link.effective_date ? `effective ${fmtDate(link.effective_date)}` : 'no policy start'}</span>
              <span>· valid to {fmtDate(link.expires_at)}</span>
            </p>
            {notice && <p className="m-0 mt-2 text-body text-trs-ink-2" >{notice}</p>}
            {error && <p className="m-0 mt-2 text-body text-trs-neg" >{error}</p>}
          </div>

          <section className="mb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="m-0 text-heading font-semibold">Received list</h2>
              {submission && (
                <span className="text-body tabular-nums text-trs-muted" >
                  {submitted ? 'Submitted' : 'Draft, not submitted'}
                  {sourceWord ? ` · ${sourceWord}${sourceFile ? ` · ${sourceFile}` : ''}` : ''}
                  {counts.missingDob > 0 ? ` · ${counts.missingDob} date${counts.missingDob === 1 ? '' : 's'} of birth missing` : ''}
                  {counts.inactive > 0 ? ` · ${counts.inactive} inactive, not priced` : ''}
                </span>
              )}
            </div>
            {!submission ? (
              <p className="m-0 py-10 text-center text-body text-trs-muted" >Nothing received yet.</p>
            ) : (
              <Register label="Received list" minWidth={880}>
                <RegisterHead>
                  <RegisterTh first width={260}>Name</RegisterTh>
                  <RegisterTh>Relationship</RegisterTh>
                  <RegisterTh>Category</RegisterTh>
                  <RegisterTh>Date of birth</RegisterTh>
                  <RegisterTh>Work pass</RegisterTh>
                  <RegisterTh last>Source</RegisterTh>
                </RegisterHead>
                <tbody>
                  {rows.length === 0 && <RegisterEmpty colSpan={6}>The list is empty.</RegisterEmpty>}
                  {rows.map(r => (
                    <RegisterRow key={r.key}>
                      <RegisterCell first identityWidth={240}
                        primary={<span className={r.inactive ? 'font-normal text-trs-muted' : undefined}>{r.name}</span>}
                        secondary={r.parent ? `dependant of ${r.parent}` : r.inactive ? 'inactive' : r.issues.length ? r.issues.join(' · ') : undefined} />
                      <RegisterCell><span className="text-body text-trs-ink-2" >{RELATIONSHIP_LABEL[r.relationship] ?? r.relationship}</span></RegisterCell>
                      <RegisterCell><span className={`text-body ${r.category ? 'text-trs-ink-2' : 'text-trs-subtle'}`}>{r.category ?? '—'}</span></RegisterCell>
                      <RegisterCell><span className={`text-body tabular-nums ${r.dob ? 'text-trs-ink-2' : 'text-trs-muted'}`}>{fmtDob(r.dob)}</span></RegisterCell>
                      <RegisterCell><span className={`text-body ${r.workPass ? 'text-trs-ink-2' : 'text-trs-subtle'}`}>{r.workPass ?? '—'}</span></RegisterCell>
                      <RegisterCell last><span className="text-body text-trs-ink-2" >{r.relationship === 'self' ? (sourceWord ?? '—') : 'Entered by HR'}</span></RegisterCell>
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            )}
            {submission && rows.length > 0 && (
              <p className="m-0 mt-3 text-body tabular-nums text-trs-muted" >
                {counts.lives} lives · {counts.employees} employees · {counts.spouses} spouses · {counts.children} children
                {submitted && submission.submitted_by_name
                  ? ` · submitted by ${submission.submitted_by_name}${submission.submitted_by_email ? `, ${submission.submitted_by_email}` : ''}${submission.consent_at ? `, consent recorded ${fmtDateTime(submission.consent_at)}` : ''}`
                  : ''}
              </p>
            )}
          </section>

          <section>
            <h2 className="m-0 mb-3 text-heading font-semibold">Link {link.reference}</h2>
            {events.length === 0 ? (
              <p className="m-0 text-body text-trs-muted" >Sent {fmtDateTime(link.sent_at)}.</p>
            ) : (
              <ol className="m-0 p-0 list-none flex flex-col gap-2">
                {events.map(ev => {
                  const rest = eventSentence(ev, link)
                  return (
                    <li key={ev.id} className="text-body leading-[1.5] text-trs-ink-2" >
                      <span className="font-medium text-trs-ink" >{EVENT_LABEL[ev.kind] ?? ev.kind}</span>
                      {' '}<span className="tabular-nums">{fmtDateTime(ev.created_at)}</span>
                      {rest ? `, ${rest}.` : '.'}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <HrModal open={confirmClose} onClose={() => setConfirmClose(false)} title="Close link" width={440}>
            <p className="m-0 text-body leading-[1.5] text-trs-ink-2" >
              {link.reference} stops opening for {link.recipient_name}. Anything HR saved as a draft stays on this page. A new link needs Resend.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <Btn type="button" level="tertiary" onClick={() => setConfirmClose(false)}>Cancel</Btn>
              <Btn type="button" level="primary" onClick={() => act('close')}>Close link</Btn>
            </div>
          </HrModal>
        </>
      )}
    </div>
    </div>
  )
}
