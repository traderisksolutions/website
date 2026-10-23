'use client'

/**
 * Email an insurer for a quotation. Pick the insurer, tick who receives it, fill the brief, and the
 * draft opens in the Engagement composer to edit and send. Insurers that are not priced in the
 * dashboard (Cigna, April) are quoted this way.
 *
 * Contacts come from insurer_contacts (employee benefits or group health). A missing contact is
 * added here and kept for next time.
 */

import { useEffect, useMemo, useState } from 'react'
import { Btn, Field, inputCls } from '@/components/crm/primitives'
import { openEngagementCompose } from '@/lib/engagement-handoff'
import { normInsurer } from '@/lib/insurers'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { HrModal } from './hr/HrModal'

const MUTED = '#5f6368'
const EMAIL_OK = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

export type InsurerOption = { id: string; name: string }
export type InsurerContact = { insurer: string; contact_id: string; name: string | null; email: string }
export type InsurerContactsResponse = { insurers?: InsurerOption[]; contacts?: InsurerContact[]; error?: string }

export async function loadInsurerContacts(): Promise<{ insurers: InsurerOption[]; contacts: InsurerContact[] }> {
  const res = await fetch('/api/group-benefits/insurer-contacts', { cache: 'no-store' })
  const d = await res.json().catch(() => ({})) as InsurerContactsResponse
  if (!res.ok) throw new Error(d.error ?? `Could not load insurer contacts (${res.status})`)
  return { insurers: d.insurers ?? [], contacts: d.contacts ?? [] }
}

export const contactsFor = (insurer: string, contacts: InsurerContact[]) =>
  contacts.filter(c => normInsurer(c.insurer) === normInsurer(insurer))

const COVER_LINES = [
  'Group Hospital & Surgical (GHS)', 'Group Term Life (GTL)', 'Group Personal Accident (GPA)',
  'Group Outpatient GP and Specialist', 'Group Dental',
]

function draftBody(v: { firstName: string; company: string; start: string; lives: string }) {
  const start = v.start ? new Date(v.start).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' }) : '[policy start]'
  return [
    `Dear ${v.firstName || 'Sir/Madam'},`,
    '',
    `We would like a group employee benefits quotation for ${v.company || '[company]'}.`,
    '',
    `Policy start: ${start}`,
    `Lives: ${v.lives || '[employees and dependants]'}`,
    `Covers: ${COVER_LINES.join('; ')}`,
    'Requirements: [ward class, co-payment, overseas cover, maternity]',
    '',
    'Member list: [attach the employee list before sending]',
    '',
    'Please send the quotation with the benefit schedule.',
    '',
    'Thank you.',
  ].join('\n')
}

export function InsurerEmailDialog({ open, onClose, initialInsurer, initialCompany, initialStart, initialLives }: {
  open: boolean
  onClose: () => void
  initialInsurer?: string | null
  initialCompany?: string | null
  initialStart?: string | null
  initialLives?: string | null
}) {
  const [insurers, setInsurers] = useState<InsurerOption[]>([])
  const [contacts, setContacts] = useState<InsurerContact[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [insurerId, setInsurerId] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [company, setCompany] = useState('')
  const [start, setStart] = useState('')
  const [lives, setLives] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCompany(initialCompany ?? ''); setStart(initialStart ?? ''); setLives(initialLives ?? ''); setAdding(false); setNewName(''); setNewEmail(''); setError(null)
    loadInsurerContacts()
      .then(d => {
        setInsurers(d.insurers); setContacts(d.contacts); setLoadError(null)
        const first = initialInsurer ? d.insurers.find(i => normInsurer(i.name) === normInsurer(initialInsurer)) : null
        setInsurerId(first?.id ?? '')
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load insurers'))
  }, [open, initialInsurer]) // eslint-disable-line react-hooks/exhaustive-deps

  const insurer = insurers.find(i => i.id === insurerId) ?? null
  const people = useMemo(() => insurer ? contactsFor(insurer.name, contacts) : [], [insurer, contacts])

  // Everyone on file for the insurer is ticked when it is picked.
  useEffect(() => { setPicked(new Set(people.map(p => p.email))) }, [people])

  // Insurers with a contact on file first, then the rest.
  const sorted = useMemo(() => {
    const has = (i: InsurerOption) => contactsFor(i.name, contacts).length > 0
    return [...insurers].sort((a, b) => Number(has(b)) - Number(has(a)) || shortInsurer(a.name).localeCompare(shortInsurer(b.name)))
  }, [insurers, contacts])

  async function addContact() {
    if (!insurer) return
    if (!EMAIL_OK(newEmail)) { setError('Email is not a valid address.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/insurer-contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insurer_company_id: insurer.id, name: newName.trim(), email: newEmail.trim() }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setError(d.error ?? `Could not save (${res.status}).`); return }
      const fresh = await loadInsurerContacts()
      setContacts(fresh.contacts)
      setAdding(false); setNewName(''); setNewEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally { setSaving(false) }
  }

  function write() {
    const to = people.filter(p => picked.has(p.email))
    if (!insurer || to.length === 0) { setError('Tick at least one recipient.'); return }
    const firstName = (to[0].name ?? '').split(/\s+/)[0] ?? ''
    openEngagementCompose({
      toEmail: to[0].email,
      toName: to[0].name ?? undefined,
      cc: to.slice(1).map(p => p.email).join(', ') || undefined,
      subject: `Group employee benefits quotation: ${company.trim() || '[company]'}`,
      body: draftBody({ firstName, company: company.trim(), start, lives: lives.trim() }),
    })
  }

  return (
    <HrModal open={open} onClose={onClose} title="Email insurer" width={600}>
      <div className="flex flex-col gap-4">
        {loadError && <p className="m-0 text-[12.5px]" style={{ color: '#c5221f' }}>{loadError}</p>}

        <Field label="Insurer">
          <select className={inputCls} value={insurerId} onChange={e => { setInsurerId(e.target.value); setAdding(false); setError(null) }}>
            <option value="">Choose an insurer</option>
            {sorted.map(i => {
              const n = contactsFor(i.name, contacts).length
              return <option key={i.id} value={i.id}>{shortInsurer(i.name)}{n ? ` · ${n} contact${n === 1 ? '' : 's'}` : ''}</option>
            })}
          </select>
        </Field>

        {insurer && (
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px]" style={{ color: MUTED }}>Recipients</span>
            {people.length === 0 && !adding && (
              <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>No employee benefits contact on file for {shortInsurer(insurer.name)}.</p>
            )}
            {people.map(p => (
              <label key={p.email} className="flex items-center gap-2.5 text-[14px] cursor-pointer">
                <input type="checkbox" className="accent-[#202124]" checked={picked.has(p.email)}
                  onChange={() => setPicked(s => { const n = new Set(s); if (n.has(p.email)) n.delete(p.email); else n.add(p.email); return n })} />
                <span>{p.name ?? p.email}</span>
                {p.name && <span className="text-[13px]" style={{ color: MUTED }}>{p.email}</span>}
              </label>
            ))}
            {adding ? (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <Field label="Name"><input className={inputCls} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jaclyn Gan" autoComplete="off" /></Field>
                <Field label="Email"><input className={inputCls} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@insurer.com" autoComplete="off" /></Field>
                <div className="flex gap-2">
                  <Btn type="button" level="tertiary" onClick={() => setAdding(false)}>Cancel</Btn>
                  <Btn type="button" level="secondary" onClick={addContact} loading={saving}>Save</Btn>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="self-start text-[13px] bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#202124' }}>
                + Add contact
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Company"><input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Pte Ltd" autoComplete="off" /></Field>
          <Field label="Policy start"><input className={inputCls} type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="Lives"><input className={inputCls} value={lives} onChange={e => setLives(e.target.value)} placeholder="6 employees, 9 dependants" autoComplete="off" /></Field>
        </div>

        {error && <p className="m-0 text-[12.5px]" style={{ color: '#c5221f' }}>{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
          <Btn type="button" level="primary" onClick={write} disabled={!insurer || picked.size === 0}>Write email</Btn>
        </div>
      </div>
    </HrModal>
  )
}
