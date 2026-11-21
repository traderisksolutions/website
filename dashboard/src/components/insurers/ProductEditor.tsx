'use client'

import { useState } from 'react'
import { Star, X } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import { PRODUCT_LINES } from '@/lib/product-lines'
import type { InsurerProduct } from '@/lib/placement/rank'
import { callApi, errText } from '@/components/placement/shared'
import { unwrap } from '@/lib/action-result'
import { addContact, editProduct, makeDefaultContact, removeContact } from '@/app/insurers/actions'

const cell = 'h-8 w-full rounded border border-trs-line-2 bg-white px-2 text-body text-trs-ink outline-none focus:border-trs-ink placeholder:text-trs-subtle'
const label = 'text-small font-medium text-trs-muted'
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
  const save = () => run(async () => unwrap(await editProduct(id, {
    name, product_line: line, accepts: splitList(accepts), declines: splitList(declines), min_premium: num(minPremium), max_lives: num(maxLives), notes: notes.trim() || null,
  })))
  const setStatus = (status: 'active' | 'paused') => run(async () => unwrap(await editProduct(id, { status })))
  const addPerson = () => run(async () => {
    const r = unwrap(await addContact(id, { email: email.trim(), name: person.trim() || null }))
    setEmail(''); setPerson('')
    return r
  })
  const makeDefault = (contactId: string) => run(async () => unwrap(await makeDefaultContact(id, contactId)))
  const remove = (contactId: string) => run(async () => unwrap(await removeContact(id, contactId)))

  return (
    <div className="px-4 py-3 flex flex-col gap-3 bg-trs-tint text-trs-ink">
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <label className="flex flex-col gap-1"><span className={label}>Product name</span><input id={`p-name-${id}`} className={cell} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Line</span>
          <select id={`p-line-${id}`} className={cell} value={line} onChange={e => setLine(e.target.value)}>
            {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className={label}>Takes (comma separated)</span><input id={`p-acc-${id}`} className={cell} value={accepts} onChange={e => setAccepts(e.target.value)} placeholder="Blank = no stated limit" /></label>
        <label className="flex flex-col gap-1"><span className={label}>Won&apos;t take</span><input id={`p-dec-${id}`} className={cell} value={declines} onChange={e => setDeclines(e.target.value)} placeholder="e.g. Construction, Marine" /></label>
        <label className="flex flex-col gap-1"><span className={label}>Min premium (S$)</span><input id={`p-min-${id}`} className={cell} inputMode="decimal" value={minPremium} onChange={e => setMinPremium(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className={label}>Max lives</span><input id={`p-max-${id}`} className={cell} inputMode="numeric" value={maxLives} onChange={e => setMaxLives(e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1"><span className={label}>Notes</span><input id={`p-notes-${id}`} className={cell} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything a broker should know before asking" /></label>

      <div className="flex flex-col gap-1">
        <span className={label}>People to ask · the starred person gets the request</span>
        <div className="flex flex-col">
          {product.contacts.length === 0 && <span className="text-body py-1 text-trs-neg">No one on file. Add a person, or this product cannot be asked.</span>}
          {product.contacts.map(c => (
            <div key={c.contact_id} className="flex items-center gap-3 h-8 text-body">
              <Btn level="tertiary" size="xs" onClick={() => makeDefault(c.contact_id)} disabled={busy || c.is_default} aria-label={c.is_default ? `${c.email} gets the request` : `Send requests to ${c.email}`}
                className={c.is_default ? 'h-auto p-0 border-0 hover:bg-transparent disabled:opacity-100 disabled:cursor-default text-trs-ink hover:text-trs-ink' : 'h-auto p-0 border-0 hover:bg-transparent disabled:cursor-default text-trs-line-2 hover:text-trs-ink'}>
                <Star size={14} fill={c.is_default ? 'currentColor' : 'none'} />
              </Btn>
              <span className="w-[180px] truncate">{c.name ?? '—'}</span>
              <span className="flex-1 truncate text-trs-muted">{c.email}</span>
              <Btn level="tertiary" size="xs" onClick={() => remove(c.contact_id)} disabled={busy} aria-label={`Remove ${c.email}`} className="h-auto p-1 border-0 hover:bg-trs-field"><X size={13} /></Btn>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input id={`p-person-${id}`} className={cn(cell, 'w-[180px]')} placeholder="Name" value={person} onChange={e => setPerson(e.target.value)} />
          <input id={`p-email-${id}`} className={cn(cell, 'w-[240px]')} placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && email.trim()) addPerson() }} />
          <Btn size="xs" onClick={addPerson} disabled={busy || !email.trim()}>Add person</Btn>
        </div>
      </div>

      {error && <p className="m-0 text-body text-trs-neg">{error}</p>}
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
