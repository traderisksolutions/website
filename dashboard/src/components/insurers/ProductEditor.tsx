'use client'

import { useState } from 'react'
import { Star, X } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { PRODUCT_LINES } from '@/lib/product-lines'
import type { InsurerProduct } from '@/lib/placement/rank'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'

const cell = 'h-8 w-full rounded-[6px] border border-[#dadce0] bg-white px-2 text-[13px] text-[#202124] outline-none focus:border-[#202124] placeholder:text-[#9aa0a6]'
const label = 'text-[11.5px] font-medium'
const splitList = (s: string) => s.split(/[,;\n]/).map(x => x.trim()).filter(Boolean)

/**
 * One product, edited in place under its row: what it is, what it will and will not take, and
 * the people to ask. The default person (starred) is who a request is addressed to. Changes save
 * on Save; people are added and removed at once.
 */
export function ProductEditor({ product, onSaved, onClose }: {
  product: InsurerProduct
  onSaved: (p: InsurerProduct) => void
  onClose: () => void
}) {
  const [name, setName] = useState(product.name)
  const [line, setLine] = useState(product.product_line)
  const [accepts, setAccepts] = useState(product.accepts.join(', '))
  const [declines, setDeclines] = useState(product.declines.join(', '))
  const [minPremium, setMinPremium] = useState(product.min_premium?.toString() ?? '')
  const [maxLives, setMaxLives] = useState(product.max_lives?.toString() ?? '')
  const [notes, setNotes] = useState(product.notes ?? '')
  const [email, setEmail] = useState('')
  const [person, setPerson] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = product.id

  async function run(fn: () => Promise<{ product: InsurerProduct }>) {
    setBusy(true); setError(null)
    try { onSaved((await fn()).product) } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const num = (s: string) => s.trim() === '' ? null : Number(s.replace(/[^0-9.]/g, ''))
  const save = () => run(() => callApi(`/api/insurers/products/${id}`, { method: 'PATCH', body: {
    name, product_line: line, accepts: splitList(accepts), declines: splitList(declines), min_premium: num(minPremium), max_lives: num(maxLives), notes: notes.trim() || null,
  } }))
  const setStatus = (status: 'active' | 'paused') => run(() => callApi(`/api/insurers/products/${id}`, { method: 'PATCH', body: { status } }))
  const addPerson = () => run(async () => {
    const r = await callApi<{ product: InsurerProduct }>(`/api/insurers/products/${id}/contacts`, { method: 'POST', body: { email: email.trim(), name: person.trim() || null } })
    setEmail(''); setPerson('')
    return r
  })
  const makeDefault = (contactId: string) => run(() => callApi(`/api/insurers/products/${id}/contacts`, { method: 'PATCH', body: { contact_id: contactId } }))
  const remove = (contactId: string) => run(() => callApi(`/api/insurers/products/${id}/contacts`, { method: 'DELETE', body: { contact_id: contactId } }))

  return (
    <div className="px-4 py-3 flex flex-col gap-3" style={{ background: '#fafafa', color: INK }}>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Product name</span><input id={`p-name-${id}`} className={cell} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Line</span>
          <select id={`p-line-${id}`} className={cell} value={line} onChange={e => setLine(e.target.value)}>
            {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Takes (comma separated)</span><input id={`p-acc-${id}`} className={cell} value={accepts} onChange={e => setAccepts(e.target.value)} placeholder="Blank = no stated limit" /></label>
        <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Won't take</span><input id={`p-dec-${id}`} className={cell} value={declines} onChange={e => setDeclines(e.target.value)} placeholder="e.g. Construction, Marine" /></label>
        <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Min premium (S$)</span><input id={`p-min-${id}`} className={cell} inputMode="decimal" value={minPremium} onChange={e => setMinPremium(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Max lives</span><input id={`p-max-${id}`} className={cell} inputMode="numeric" value={maxLives} onChange={e => setMaxLives(e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1"><span className={label} style={{ color: MUTED }}>Notes</span><input id={`p-notes-${id}`} className={cell} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything a broker should know before asking" /></label>

      <div className="flex flex-col gap-1">
        <span className={label} style={{ color: MUTED }}>People to ask · the starred person gets the request</span>
        <div className="flex flex-col">
          {product.contacts.length === 0 && <span className="text-[13px] py-1" style={{ color: ERROR }}>No one on file. Add a person, or this product cannot be asked.</span>}
          {product.contacts.map(c => (
            <div key={c.contact_id} className="flex items-center gap-3 h-8 text-[13px]">
              <button type="button" onClick={() => makeDefault(c.contact_id)} disabled={busy || c.is_default} aria-label={c.is_default ? `${c.email} gets the request` : `Send requests to ${c.email}`}
                className="bg-transparent border-0 p-0 cursor-pointer disabled:cursor-default" style={{ color: c.is_default ? INK : '#bdc1c6' }}>
                <Star size={14} fill={c.is_default ? INK : 'none'} />
              </button>
              <span className="w-[180px] truncate">{c.name ?? '—'}</span>
              <span className="flex-1 truncate" style={{ color: MUTED }}>{c.email}</span>
              <button type="button" onClick={() => remove(c.contact_id)} disabled={busy} aria-label={`Remove ${c.email}`} className="bg-transparent border-0 p-1 cursor-pointer rounded hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input id={`p-person-${id}`} className={cell} style={{ width: 180 }} placeholder="Name" value={person} onChange={e => setPerson(e.target.value)} />
          <input id={`p-email-${id}`} className={cell} style={{ width: 240 }} placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && email.trim()) addPerson() }} />
          <Btn size="xs" onClick={addPerson} disabled={busy || !email.trim()}>Add person</Btn>
        </div>
      </div>

      {error && <p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p>}
      <div className="flex items-center gap-2">
        <Btn level="primary" size="xs" onClick={save} loading={busy}>Save</Btn>
        <Btn size="xs" onClick={onClose} disabled={busy}>Close</Btn>
        <span className="flex-1" />
        {product.status === 'active'
          ? <Btn level="tertiary" size="xs" onClick={() => setStatus('paused')} disabled={busy}>Pause (stop suggesting)</Btn>
          : <Btn level="tertiary" size="xs" onClick={() => setStatus('active')} disabled={busy}>Resume</Btn>}
      </div>
    </div>
  )
}
