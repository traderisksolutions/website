'use client'

/**
 * One insurer's employee benefits contacts: correct a name or email, take someone off the list,
 * add someone. Edits change the contact record, so the corrected address is used everywhere.
 */

import { useCallback, useEffect, useState } from 'react'
import { Btn, Field, inputCls } from '@/components/crm/primitives'
import { normInsurer } from '@/lib/insurers'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { HrModal } from './hr/HrModal'
import { contactsFor, loadInsurerContacts, type InsurerContact, type InsurerOption } from './InsurerEmailDialog'

const MUTED = '#5f6368'
const EMAIL_OK = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

type Draft = { name: string; email: string }

export function InsurerContactsDialog({ open, insurer, onClose, onChanged }: {
  open: boolean
  insurer: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [option, setOption] = useState<InsurerOption | null>(null)
  const [people, setPeople] = useState<InsurerContact[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const load = useCallback(async () => {
    if (!insurer) return
    const d = await loadInsurerContacts()
    const list = contactsFor(insurer, d.contacts)
    setOption(d.insurers.find(i => normInsurer(i.name) === normInsurer(insurer)) ?? null)
    setPeople(list)
    setDrafts(Object.fromEntries(list.map(p => [p.contact_id, { name: p.name ?? '', email: p.email }])))
  }, [insurer])

  useEffect(() => {
    if (!open) return
    setError(null); setNewName(''); setNewEmail('')
    load().catch(e => setError(e instanceof Error ? e.message : 'Could not load contacts'))
  }, [open, load])

  async function call(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>, tag: string) {
    setBusy(tag); setError(null)
    try {
      const res = await fetch('/api/group-benefits/insurer-contacts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setError(d.error ?? `Not saved (${res.status}).`); return false }
      await load(); onChanged()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved.'); return false
    } finally { setBusy(null) }
  }

  function save(p: InsurerContact) {
    const d = drafts[p.contact_id]
    if (!EMAIL_OK(d.email)) { setError('Email is not a valid address.'); return }
    void call('PATCH', { contact_id: p.contact_id, name: d.name, email: d.email }, p.contact_id)
  }

  async function add() {
    if (!option) { setError('Insurer not found in Companies.'); return }
    if (!EMAIL_OK(newEmail)) { setError('Email is not a valid address.'); return }
    if (await call('POST', { insurer_company_id: option.id, name: newName.trim(), email: newEmail.trim() }, 'new')) { setNewName(''); setNewEmail('') }
  }

  const changed = (p: InsurerContact) => {
    const d = drafts[p.contact_id]
    return !!d && (d.name.trim() !== (p.name ?? '') || d.email.trim().toLowerCase() !== p.email.toLowerCase())
  }

  return (
    <HrModal open={open} onClose={onClose} title={`${shortInsurer(insurer)} contacts`} width={780}>
      <div className="flex flex-col gap-4">
        {people.length === 0 && <p className="m-0 text-[14px]" style={{ color: MUTED }}>No employee benefits contact on file.</p>}
        {people.map(p => {
          const d = drafts[p.contact_id] ?? { name: '', email: '' }
          return (
            <div key={p.contact_id} className="grid grid-cols-1 sm:grid-cols-[1fr_1.7fr_auto] gap-2 items-end">
              <Field label="Name"><input className={inputCls} value={d.name} onChange={e => setDrafts(s => ({ ...s, [p.contact_id]: { ...d, name: e.target.value } }))} autoComplete="off" /></Field>
              <Field label="Email"><input className={inputCls} type="email" value={d.email} onChange={e => setDrafts(s => ({ ...s, [p.contact_id]: { ...d, email: e.target.value } }))} autoComplete="off" /></Field>
              <div className="flex gap-2">
                <Btn type="button" level="tertiary" loading={busy === `rm:${p.contact_id}`} onClick={() => void call('DELETE', { insurer, contact_id: p.contact_id }, `rm:${p.contact_id}`)}>Remove</Btn>
                <Btn type="button" level="secondary" disabled={!changed(p)} loading={busy === p.contact_id} onClick={() => save(p)}>Save</Btn>
              </div>
            </div>
          )
        })}

        <div className="pt-3 grid grid-cols-1 sm:grid-cols-[1fr_1.7fr_auto] gap-2 items-end" style={{ borderTop: '1px solid #e8eaed' }}>
          <Field label="New contact"><input className={inputCls} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" autoComplete="off" /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@insurer.com" autoComplete="off" /></Field>
          <Btn type="button" level="secondary" loading={busy === 'new'} disabled={!newEmail.trim()} onClick={() => void add()}>Add</Btn>
        </div>

        {error && <p className="m-0 text-[12.5px]" style={{ color: '#c5221f' }}>{error}</p>}
        <div className="flex justify-end"><Btn type="button" level="tertiary" onClick={onClose}>Done</Btn></div>
      </div>
    </HrModal>
  )
}
