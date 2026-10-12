'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown, Copy, Check } from 'lucide-react'
import { Btn, Chip, inputCls, textareaCls } from '@/components/crm/primitives'
import { DetailSection, DetailField } from '@/components/detail-section'
import { AccountChip, ActionChip, EmailChip, FlagChip, OutreachChip } from './chips'
import { Evidence, SafeLink } from './Evidence'
import { toEvidence, mobileForWhatsApp, whatsappLink } from '@/lib/sales/evidence'
import { locationLabel, type LeadContact, type LeadDetail } from '@/lib/sales/types'
import { fmtDate } from '@/lib/sales/labels'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

type Loaded = { id: string } & ({ status: 'missing' | 'error' } | { status: 'ready'; lead: LeadDetail })

/** The lead panel: fixed on the right like the Companies drawer. J/K or arrow keys step through
 *  the current page without closing. */
export function LeadDrawer({ id, lookupOn, onClose, onPrev, onNext, onChanged }: {
  id: string | null; lookupOn: boolean; onClose: () => void; onPrev?: () => void; onNext?: () => void; onChanged: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const panel = useRef<HTMLElement>(null)
  const changed = useCallback(() => { setReloadKey(k => k + 1); onChanged() }, [onChanged])

  useEffect(() => {
    if (!id) return
    const ctrl = new AbortController()
    fetch(`/api/sales/leads/${id}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async res => {
        if (res.status === 404) return setLoaded({ id, status: 'missing' })
        if (!res.ok) return setLoaded({ id, status: 'error' })
        setLoaded({ id, status: 'ready', lead: (await res.json()).lead })
      })
      .catch(e => { if (e?.name !== 'AbortError') setLoaded({ id, status: 'error' }) })
    return () => ctrl.abort()
  }, [id, reloadKey])

  useEffect(() => {
    if (!id) return
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'Escape') onClose()
      if ((e.key === 'j' || e.key === 'ArrowDown') && onNext) { e.preventDefault(); onNext() }
      if ((e.key === 'k' || e.key === 'ArrowUp') && onPrev) { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose, onNext, onPrev])

  if (!id) return null
  const state = loaded && loaded.id === id ? loaded : { status: 'loading' as const }
  const lead = state.status === 'ready' ? state.lead : null

  return (
    <aside ref={panel} tabIndex={-1} role="dialog" aria-label={lead?.company ?? 'Lead'}
      className="fixed right-0 z-40 w-full sm:w-[480px] bg-white flex flex-col outline-none"
      style={{ top: 56, bottom: 0, borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(32,33,36,0.25)', color: INK }}>
      <div className="flex-shrink-0 px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]" style={{ textWrap: 'balance' }}>{lead ? lead.company ?? lead.domain ?? 'Unnamed' : 'Lead'}</h2>
            {lead && (
              <p className="m-0 mt-2 flex items-center gap-2 flex-wrap text-[13.5px]" style={{ color: MUTED }}>
                <span title={locationLabel(lead.location)}>{locationLabel(lead.location)}</span>
                {lead.domain && <><span aria-hidden>·</span><SafeLink href={`https://${lead.domain.replace(/^https?:\/\//, '')}`}>{lead.domain}</SafeLink></>}
                <AccountChip status={lead.account_status} />
                <ActionChip action={lead.recommended_action} />
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 -mr-2 -mt-1">
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous lead" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-30 disabled:cursor-default" style={{ color: MUTED }}><ChevronUp size={18} /></button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next lead" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-30 disabled:cursor-default" style={{ color: MUTED }}><ChevronDown size={18} /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={18} /></button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        {state.status === 'loading' && <p className="m-0 px-4 py-6 text-[14px]" style={{ color: MUTED }}>Loading…</p>}
        {state.status === 'missing' && <p className="m-0 px-4 py-6 text-[14px]" role="alert">This lead no longer exists.</p>}
        {state.status === 'error' && <p className="m-0 px-4 py-6 text-[14px]" role="alert">This lead did not load. Close and try again.</p>}
        {lead && <LeadBody lead={lead} lookupOn={lookupOn} onChanged={changed} />}
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return <DetailField label={label}><span className="whitespace-pre-wrap break-words">{children}</span></DetailField>
}

function Figure({ label, value, suffix = '' }: { label: string; value: number | null | undefined; suffix?: string }) {
  return (
    <div>
      <p className="m-0 text-[12px]" style={{ color: MUTED }}>{label}</p>
      <p className="m-0 text-[20px] font-medium tabular-nums" style={{ color: INK }}>{value ?? '–'}{value != null && <span className="text-[12px] font-normal" style={{ color: MUTED }}>{suffix}</span>}</p>
    </div>
  )
}

function LeadBody({ lead, lookupOn, onChanged }: { lead: LeadDetail; lookupOn: boolean; onChanged: () => void }) {
  const evidence = toEvidence(lead.evidence)
  const reasons = toEvidence(lead.score_reasons)
  const uncertainty = toEvidence(lead.uncertainty)
  const contacts = Array.isArray(lead.contacts) ? lead.contacts : []
  const sources = (lead.source_urls ?? []).filter(Boolean)
  const hasIntent = lead.intent_summary || lead.workflow_pain || lead.conversation_angle || lead.product_line
  return (
    <>
      <DetailSection label="Snapshot">
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Figure label="Fit" value={lead.fit_score} />
          <Figure label="Intent" value={lead.intent_score} />
          <Figure label="Score" value={lead.total_score} suffix="/200" />
          <Figure label="Confidence" value={lead.confidence == null ? null : Math.round(Number(lead.confidence) * 100)} suffix="%" />
        </div>
        <Row label="Industry">{lead.industry}</Row>
        <Row label="Size">{lead.company_size}</Row>
        <Row label="Business model">{lead.business_model}</Row>
        <Row label="Legal name">{lead.legal_name !== lead.company ? lead.legal_name : null}</Row>
        <Row label="Country">{lead.country}</Row>
        <Row label="Discovered">{fmtDate(lead.discovery_date)}</Row>
        <Row label="Last researched">{fmtDate(lead.last_researched_at)}</Row>
        <Row label="Source">{lead.source}</Row>
        {lead.exclusion_flags && lead.exclusion_flags.length > 0 && <DetailField label="Flags"><span className="flex flex-wrap gap-1">{lead.exclusion_flags.map(f => <FlagChip key={f} flag={f} />)}</span></DetailField>}
      </DetailSection>

      {hasIntent && (
        <DetailSection label="Why now">
          {lead.intent_summary && <p className="m-0 mb-3 whitespace-pre-wrap pl-3 text-[14px]" style={{ borderLeft: `2px solid ${INK}` }}>{lead.intent_summary}</p>}
          <Row label="Pain">{lead.workflow_pain}</Row>
          <Row label="Angle">{lead.conversation_angle}</Row>
          <Row label="Cover">{lead.product_line}</Row>
        </DetailSection>
      )}

      {(evidence || uncertainty || reasons || sources.length > 0) && (
        <DetailSection label="Evidence">
          <div className="flex flex-col gap-4 text-[13.5px]">
            {evidence && <Evidence node={evidence} />}
            {uncertainty && <div><p className="m-0 mb-1.5 text-[12px] font-medium" style={{ color: MUTED }}>Uncertain</p><Evidence node={uncertainty} /></div>}
            {reasons && <details><summary className="cursor-pointer text-[12px] font-medium" style={{ color: MUTED }}>Scoring reasons</summary><div className="mt-2"><Evidence node={reasons} /></div></details>}
            {sources.length > 0 && <div><p className="m-0 mb-1.5 text-[12px] font-medium" style={{ color: MUTED }}>Sources</p><ul className="m-0 flex list-none flex-col gap-1 p-0">{sources.map((u, i) => <li key={i}><SafeLink href={u} /></li>)}</ul></div>}
          </div>
        </DetailSection>
      )}

      <DetailSection label={`Contacts${contacts.length ? ` · ${contacts.length}` : ''}`}>
        {contacts.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>No contacts found.</p> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {contacts.map((c, i) => <ContactItem key={c.id ?? i} c={c} primary={i === 0} location={lead.location} />)}
          </ul>
        )}
        <FindEmail leadId={lead.id} on={lookupOn} needed={!lead.email_verified} onChanged={onChanged} />
      </DetailSection>

      <DraftSection lead={lead} onChanged={onChanged} />
    </>
  )
}

function ContactItem({ c, primary, location }: { c: LeadContact; primary: boolean; location: string | null }) {
  const mobile = mobileForWhatsApp(c.phone, location)
  return (
    <li className="py-3 first:pt-0 last:pb-0" style={{ borderBottom: `1px solid ${RULE}` }}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="m-0 text-[14.5px] font-medium">{c.name ?? 'Unnamed'}</p>
        {primary && <span className="text-[12px]" style={{ color: '#9aa0a6' }}>Primary</span>}
      </div>
      {c.title && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{c.title}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px]">
        {c.email && <span className="break-all" style={{ color: MUTED }}>{c.email}</span>}
        <EmailChip status={c.email_status} hasEmail={!!c.email} />
        {c.email && <CopyButton text={c.email} label="Copy" />}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: MUTED }}>
        {c.email_confidence != null && <span className="tabular-nums">Confidence {Math.round(Number(c.email_confidence) * 100)}%</span>}
        {c.email_source_url && <SafeLink href={c.email_source_url}>Email source</SafeLink>}
        {c.linkedin_url && <SafeLink href={c.linkedin_url}>LinkedIn</SafeLink>}
        {c.phone && <span>{c.phone}{c.phone_status ? ` · ${c.phone_status.replace(/_/g, ' ')}` : ''}</span>}
        {mobile && <a href={whatsappLink(mobile, '')} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color: INK }}>WhatsApp</a>}
      </div>
    </li>
  )
}

function FindEmail({ leadId, on, needed, onChanged }: { leadId: string; on: boolean; needed: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!needed) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 pt-4" style={{ borderTop: `1px solid ${RULE}` }}>
      <Btn size="xs" disabled={!on || busy} loading={busy} title={on ? 'Uses one lookup credit' : 'Email lookup is off: set NETROWS_API_KEY'}
        onClick={async () => {
          setBusy(true); setMsg('')
          try {
            const res = await fetch(`/api/sales/leads/${leadId}/lookup`, { method: 'POST' })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) { setMsg(j.error ?? 'Lookup failed'); return }
            setMsg(j.found ? (j.verified ? 'Verified email found' : 'Email found, not verified') : 'No verified email found')
            if (j.found) onChanged()
          } finally { setBusy(false) }
        }}>
        {busy ? 'Looking up…' : 'Find email'}
      </Btn>
      {msg && <span className="text-[13px]" style={{ color: MUTED }} aria-live="polite">{msg}</span>}
    </div>
  )
}

type DraftState = { draft: { status: string; blockers: string[] } | null; workflow: { lookup: boolean; sending: boolean } }

function DraftSection({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const [meta, setMeta] = useState<DraftState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(lead.outreach_subject ?? '')
  const [body, setBody] = useState(lead.outreach_body ?? '')

  useEffect(() => {
    if (!lead.outreach_status) return
    const ctrl = new AbortController()
    fetch(`/api/sales/leads/${lead.id}/draft`, { signal: ctrl.signal, cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => j && setMeta(j)).catch(() => {})
    return () => ctrl.abort()
  }, [lead.id, lead.outreach_status, lead.outreach_version])

  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(action); setError('')
    try {
      const res = await fetch(`/api/sales/leads/${lead.id}/draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not update the draft.'); return }
      setEditing(false); onChanged()
    } finally { setBusy(null) }
  }

  if (!lead.outreach_status) return <DetailSection label="Draft"><OutreachChip status={null} /></DetailSection>
  const status = meta?.draft?.status ?? lead.outreach_status
  const blockers = meta?.draft?.blockers ?? []
  const text = [lead.outreach_subject ? `Subject: ${lead.outreach_subject}` : '', lead.outreach_body ?? ''].filter(Boolean).join('\n\n')

  return (
    <DetailSection label="Draft">
      <div className="flex flex-wrap items-center gap-2">
        <OutreachChip status={lead.outreach_status} />
        <span className="text-[12.5px]" style={{ color: MUTED }}>{lead.outreach_channel === 'email' ? 'Email' : lead.outreach_channel}{lead.outreach_version ? ` · v${lead.outreach_version}` : ''}</span>
      </div>
      <ol className="m-0 mt-3 grid list-none grid-cols-3 gap-2 p-0 text-[12px]">
        {[['Drafted', lead.drafted_at, '–'], ['Approved', lead.approved_at, 'Not approved'], ['Sent', lead.sent_at, 'Not sent']].map(([label, at, empty]) => (
          <li key={label} className="rounded-[10px] p-2.5" style={{ border: `1px solid ${RULE}`, color: at ? INK : '#9aa0a6' }}>
            <p className="m-0 font-medium">{label}</p><p className="m-0 mt-0.5">{fmtDate(at as string | null) ?? empty}</p>
          </li>
        ))}
      </ol>

      {editing ? (
        <form className="mt-3 flex flex-col gap-2" onSubmit={e => { e.preventDefault(); act('edit', { subject, body }) }}>
          <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} placeholder="Subject" aria-label="Subject" className={inputCls} />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} maxLength={10000} aria-label="Message" className={textareaCls} />
          <div className="flex gap-2">
            <Btn level="primary" size="xs" type="submit" loading={busy === 'edit'}>Save draft</Btn>
            <Btn level="tertiary" size="xs" type="button" onClick={() => { setEditing(false); setSubject(lead.outreach_subject ?? ''); setBody(lead.outreach_body ?? '') }}>Cancel</Btn>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-3">
            <Row label="To">{lead.outreach_to_email ?? <span className="font-medium">No recipient email</span>}</Row>
            <Row label="Subject">{lead.outreach_subject}</Row>
          </div>
          {lead.outreach_body && <div className="mt-2 max-w-[65ch] whitespace-pre-wrap break-words rounded-[10px] p-4 text-[14px] leading-relaxed" style={{ border: `1px solid ${RULE}` }}>{lead.outreach_body}</div>}
        </>
      )}

      {!editing && (
        <div className="mt-4 flex flex-col gap-3 pt-4" style={{ borderTop: `1px solid ${RULE}` }}>
          <div className="flex flex-wrap gap-2">
            {status === 'pending_approval' && (
              <>
                <Btn level="primary" size="xs" disabled={!!busy || blockers.length > 0 || !meta} loading={busy === 'approve'} onClick={() => act('approve')}>Approve</Btn>
                <Btn size="xs" disabled={!!busy} onClick={() => setEditing(true)}>Edit</Btn>
                <Btn level="tertiary" size="xs" disabled={!!busy} onClick={() => act('reject')}>Reject</Btn>
              </>
            )}
            {status === 'approved' && (
              <>
                <Btn size="xs" disabled={!!busy} onClick={() => act('reopen')}>Withdraw approval</Btn>
                <Btn level="tertiary" size="xs" disabled={!!busy} onClick={() => act('reject')}>Reject</Btn>
              </>
            )}
            {status === 'rejected' && <Btn size="xs" disabled={!!busy} onClick={() => act('reopen')}>Reopen</Btn>}
            {status === 'sent' && <Btn size="xs" disabled={!!busy} onClick={() => act('mark_replied')}>Mark replied</Btn>}
            {text && <CopyButton text={text} label="Copy draft" />}
          </div>
          {status === 'pending_approval' && blockers.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px]" style={{ color: MUTED }} aria-label="Approval blocked">{blockers.map(b => <li key={b}>{b}</li>)}</ul>
          )}
          {status === 'approved' && meta && !meta.workflow.sending && <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Sending off. Approved drafts wait.</p>}
          {error && <p className="m-0 text-[13px]" role="alert">{error}</p>}
        </div>
      )}
    </DetailSection>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Btn size="xs" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}>
      {done ? <Check size={12} /> : <Copy size={12} />}<span aria-live="polite">{done ? 'Copied' : label}</span>
    </Btn>
  )
}

export { Chip }
