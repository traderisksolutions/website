'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { Btn, inputCls, textareaCls } from '@/components/crm/primitives'
import { DetailSection, DetailField } from '@/components/detail-section'
import { FIND_QUESTIONS, FLAG_LABEL, FORM_TITLE, PRODUCT_LABEL, SOURCE_COLUMNS, answerLabel } from '@/lib/intake/labels'
import { bookingLabel, fmtWhen, whatsappHref } from '@/lib/intake/format'

const INK = '#0f1412'
const MUTED = '#4a5550'
const RULE = '#e6e8e4'

const STATUSES: [string, string][] = [['submitted', 'New'], ['contacted', 'Contacted'], ['met', 'Met'], ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost']]

type Intake = {
  id: string; status: string; kind: string; company_name: string | null; contact_name: string | null; email: string | null; phone: string | null
  industry: string | null; answers: Record<string, unknown>
  product_requests: { product: string; chubb_form?: string; chubb_table_premium?: number | null }[]
  flags: string[]; proposal_fields: Record<string, Record<string, number>>; documents: { kind?: string; name?: string; bytes?: number }[]
  booking: { day?: string; time?: string; format?: string } | null; consent_pdpa_at: string | null; source_url: string | null
  note: string | null; submitted_at: string | null; created_at: string; updated_at: string
}
type Loaded = { id: string } & ({ status: 'missing' | 'error' } | { status: 'ready'; intake: Intake })

/** One submission: contact, call request, cover, every answer in questionnaire order, and how much
 *  of each Chubb proposal form the answers already fill. */
export function EnquiryDrawer({ id, onClose, onPrev, onNext, onChanged }: {
  id: string | null; onClose: () => void; onPrev?: () => void; onNext?: () => void; onChanged: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!id) return
    const ctrl = new AbortController()
    fetch(`/api/sales/enquiries/${id}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async res => {
        if (res.status === 404) return setLoaded({ id, status: 'missing' })
        if (!res.ok) return setLoaded({ id, status: 'error' })
        setLoaded({ id, status: 'ready', intake: (await res.json()).intake })
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

  const changed = useCallback(() => { setReloadKey(k => k + 1); onChanged() }, [onChanged])

  if (!id) return null
  const state = loaded && loaded.id === id ? loaded : { status: 'loading' as const }
  const it = state.status === 'ready' ? state.intake : null

  return (
    <aside ref={panel} tabIndex={-1} role="dialog" aria-label={it?.company_name ?? 'Enquiry'}
      className="fixed right-0 z-40 w-full sm:w-[560px] bg-white flex flex-col outline-none"
      style={{ top: 56, bottom: 0, borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(15,20,18,0.25)', color: INK }}>
      <div className="flex-shrink-0 px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-medium leading-[1.2] tracking-[-0.01em]" style={{ textWrap: 'balance' }}>{it ? it.company_name ?? 'No company yet' : 'Enquiry'}</h2>
            {it && <p className="m-0 mt-2 text-[13.5px]" style={{ color: MUTED }}>
              {it.status === 'partial' ? `Unfinished · last saved ${fmtWhen(it.updated_at)}` : `Submitted ${fmtWhen(it.submitted_at)}`}
            </p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 -mr-2 -mt-1">
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous enquiry" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee] disabled:opacity-30 disabled:cursor-default" style={{ color: MUTED }}><ChevronUp size={18} /></button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next enquiry" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee] disabled:opacity-30 disabled:cursor-default" style={{ color: MUTED }}><ChevronDown size={18} /></button>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee]" style={{ color: MUTED }}><X size={18} /></button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        {state.status === 'loading' && <p className="m-0 px-4 py-6 text-[14px]" style={{ color: MUTED }}>Loading…</p>}
        {state.status === 'missing' && <p className="m-0 px-4 py-6 text-[14px]" role="alert">This enquiry no longer exists.</p>}
        {state.status === 'error' && <p className="m-0 px-4 py-6 text-[14px]" role="alert">This enquiry did not load. Close and try again.</p>}
        {it && <Body key={it.id} it={it} onChanged={changed} />}
      </div>
    </aside>
  )
}

function Body({ it, onChanged }: { it: Intake; onChanged: () => void }) {
  const [status, setStatus] = useState(it.status)
  const [note, setNote] = useState(it.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dirty = status !== it.status || note !== (it.note ?? '')

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const body: Record<string, unknown> = { note: note.trim() || null }
      if (status !== it.status) body.status = status
      const res = await fetch(`/api/sales/enquiries/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not save')
      onChanged()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const wa = whatsappHref(it.phone)
  const groups: { sec: string; items: { id: string; title: string; value: string }[] }[] = []
  let sec = ''
  for (const q of FIND_QUESTIONS) {
    if (q.sec) sec = q.sec
    if (['contact', 'slot', 'needs', 'upload', 'format'].includes(q.id)) continue
    if (!(q.id in it.answers)) continue
    let g = groups.find(x => x.sec === sec)
    if (!g) { g = { sec, items: [] }; groups.push(g) }
    g.items.push({ id: q.id, title: q.title, value: answerLabel(q.id, it.answers[q.id]) })
  }
  // Quote-form enquiries carry their own keys; show every one with a plain label.
  if (it.kind === 'enquiry') {
    const LABELS: Record<string, string> = {
      form: 'Form', business_type: 'Business type', business_group: 'Group', uen: 'UEN', headcount: 'Staff', role: 'Role',
      needed_by: 'Cover needed from', claims_5y: 'Claims in 5 years', contract_requirement: 'Lease or contract asks for',
      call_format: 'Call by', call_day: 'Preferred day', call_slot: 'Time of day', notes: 'Notes', details: 'Details',
      common_for_type: 'Common for this type', cover: 'Cover',
    }
    const show = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v)
    const items = Object.entries(it.answers as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => ({ id: k, title: LABELS[k] ?? k.replace(/_/g, ' '), value: show(v) }))
    if (items.length) groups.push({ sec: 'Quote request', items })
  }
  const formKeys = Object.keys(it.proposal_fields ?? {})

  return (
    <>
      <DetailSection label="Progress">
        <div className="grid gap-3">
          {it.status === 'partial' ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>The buyer has not finished the form.</p> : (
            <label className="grid gap-1 text-[12px]" style={{ color: MUTED }}>Status
              <select value={status} onChange={e => setStatus(e.target.value)} className={`${inputCls} h-9 text-[14px]`}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-[12px]" style={{ color: MUTED }}>Note
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className={`${textareaCls} text-[14px]`} placeholder="What was agreed on the call" />
          </label>
          <div className="flex items-center gap-3">
            <Btn level="primary" onClick={save} disabled={!dirty} loading={busy}>Save</Btn>
            {err && <span className="text-[13px]" role="alert">{err}</span>}
          </div>
        </div>
      </DetailSection>

      <DetailSection label="Contact">
        <DetailField label="Name">{it.contact_name ?? '–'}</DetailField>
        <DetailField label="Email">{it.email ? <a href={`mailto:${it.email}`} className="underline underline-offset-2" style={{ color: INK }}>{it.email}</a> : '–'}</DetailField>
        <DetailField label="Phone">{it.phone ? <>{it.phone}{wa && <> · <a href={wa} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: INK }}>WhatsApp</a></>}</> : '–'}</DetailField>
        <DetailField label="Preferred call">{bookingLabel(it.booking) ? `${bookingLabel(it.booking)} SGT · ${it.booking?.format === 'whatsapp' ? 'WhatsApp call' : 'Google Meet'}` : '–'}</DetailField>
      </DetailSection>

      <DetailSection label={`Cover requested · ${it.product_requests?.length ?? 0}`}>
        {(it.product_requests ?? []).length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>None chosen yet.</p> : (
          <table className="trs-table w-full border-collapse text-[13.5px]">
            <thead><tr style={{ color: MUTED }}><th className="text-left font-normal py-1.5 pr-3">Cover</th><th className="text-left font-normal py-1.5 pr-3">Chubb form</th><th className="text-right font-normal py-1.5">Chubb table</th></tr></thead>
            <tbody>{it.product_requests.map(p => (
              <tr key={p.product} style={{ borderTop: `1px solid ${RULE}` }}>
                <td className="py-2 pr-3 align-top">{PRODUCT_LABEL[p.product] ?? p.product}</td>
                <td className="py-2 pr-3 align-top" style={{ color: MUTED }}>{p.chubb_form ?? '–'}</td>
                <td className="py-2 align-top text-right tabular-nums">{p.chubb_table_premium != null ? `S$${p.chubb_table_premium.toLocaleString('en-SG')}` : '–'}</td>
              </tr>))}</tbody>
          </table>
        )}
        {it.flags?.length > 0 && <DetailField label="Flags for the adviser" className="mt-3">{it.flags.map(f => FLAG_LABEL[f] ?? f).join(', ')}</DetailField>}
      </DetailSection>

      {groups.map(g => (
        <DetailSection key={g.sec} label={g.sec}>
          <table className="trs-table w-full border-collapse text-[13.5px]">
            <tbody>{g.items.map(a => (
              <tr key={a.id} style={{ borderTop: `1px solid ${RULE}` }}>
                <td className="py-2 pr-4 align-top w-[55%]" style={{ color: MUTED }}>{a.title}</td>
                <td className="py-2 align-top whitespace-pre-wrap break-words">{a.value}</td>
              </tr>))}</tbody>
          </table>
        </DetailSection>
      ))}

      {formKeys.length > 0 && (
        <DetailSection label="Proposal fields">
          <div className="overflow-x-auto">
            <table className="trs-table w-full border-collapse text-[13px]">
              <thead><tr style={{ color: MUTED }}><th className="text-left font-normal py-1.5 pr-3">Form</th>{SOURCE_COLUMNS.map(([, l]) => <th key={l} className="text-right font-normal py-1.5 px-1.5">{l}</th>)}</tr></thead>
              <tbody>{formKeys.map(k => (
                <tr key={k} style={{ borderTop: `1px solid ${RULE}` }}>
                  <td className="py-2 pr-3">{FORM_TITLE[k] ?? k}</td>
                  {SOURCE_COLUMNS.map(([c]) => <td key={c} className="py-2 px-1.5 text-right tabular-nums">{it.proposal_fields[k]?.[c] ?? 0}</td>)}
                </tr>))}</tbody>
            </table>
          </div>
        </DetailSection>
      )}

      {it.documents?.length > 0 && (
        <DetailSection label="Documents">
          {it.documents.map((d, i) => <p key={i} className="m-0 text-[14px]">{d.name ?? 'File'}{d.bytes ? ` · ${(d.bytes / 1048576).toFixed(1)} MB` : ''} <span style={{ color: MUTED }}>(name only; ask the buyer to email it)</span></p>)}
        </DetailSection>
      )}

      <DetailSection label="Record">
        <DetailField label="PDPA consent">{it.consent_pdpa_at ? fmtWhen(it.consent_pdpa_at) : 'Not given'}</DetailField>
        <DetailField label="Page">{it.source_url ?? '–'}</DetailField>
        <DetailField label="Started">{fmtWhen(it.created_at)}</DetailField>
        <DetailField label="Submission id"><span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{it.id}</span></DetailField>
      </DetailSection>
    </>
  )
}
