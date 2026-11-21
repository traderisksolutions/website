'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Btn, Spinner, Segmented } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow, RegisterEmpty } from '@/components/ui/register'
import { ProductEditor } from '@/components/insurers/ProductEditor'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'
import type { InsurerProduct, ProductStats } from '@/lib/placement/rank'
import { callApi, errText } from '@/components/placement/shared'
import { DeclinesRegister } from './DeclinesRegister'
import { num } from '@/lib/format'
import { unwrap } from '@/lib/action-result'
import { addInsurer, addProduct, products } from '@/app/insurers/actions'

type Row = InsurerProduct & { stats: ProductStats }
type Insurer = { id: string; name: string; domain: string | null }
const COLS = 13
const cell = 'h-8 rounded border border-trs-line-2 bg-white px-2 text-body text-trs-ink outline-none focus:border-trs-ink placeholder:text-trs-subtle'
const dash = <span className="text-trs-subtle">—</span>
const short = (xs: string[]) => xs.length === 0 ? dash : <span title={xs.join(', ')}>{xs.slice(0, 2).join(', ')}{xs.length > 2 ? ` +${xs.length - 2}` : ''}</span>

/**
 * Insurers: who we can ask for what. Every insurer, each product it offers per line, what the
 * product will and will not take, and the person a request goes to. The router suggests insurers
 * for a quote request only from here. Asked, quoted, won and days to quote fill in from requests.
 */
/**
 * Every insurer, product by product: appetite, contacts, track record. Shown as the Insurers tab of
 * Contacts; `embedded` drops the page frame and title there.
 */
export function InsurersDirectory({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [insurers, setInsurers] = useState<Insurer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [line, setLine] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<null | 'insurer' | 'product'>(null)
  const [view, setView] = useState<'products' | 'declines'>('products')

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = unwrap(await products()) as unknown as { insurers: Insurer[]; products: Row[] }
      setRows(d.products); setInsurers(d.insurers)
    } catch (e) { setError(errText(e)); setRows([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const saved = (p: InsurerProduct) => setRows(rs => rs ? rs.map(r => r.id === p.id ? { ...r, ...p } : r) : rs)

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = (rows ?? []).filter(r => (!line || r.product_line === line) && (!needle || [r.insurer_name, r.name, productLineLabel(r.product_line), ...r.accepts, ...r.declines, ...r.contacts.flatMap(c => [c.email, c.name ?? ''])].join(' ').toLowerCase().includes(needle)))
    const m = new Map<string, Row[]>()
    for (const r of list) m.set(r.insurer_name, [...(m.get(r.insurer_name) ?? []), r])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows, q, line])
  const total = rows?.length ?? 0
  const noContact = (rows ?? []).filter(r => r.status === 'active' && r.contacts.length === 0).length

  return (
    <div className={embedded ? 'text-trs-ink' : 'min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink'}>
      <div className={embedded ? 'pt-6' : 'mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20'}>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            {!embedded && <h1 className="m-0 text-title font-semibold leading-[1.08]">Insurers</h1>}
            <p className={embedded ? 'm-0 text-body text-trs-muted' : 'm-0 mt-2 text-body text-trs-muted'}>
              {rows ? `${new Set(rows.map(r => r.insurer_company_id)).size} insurers · ${total} products${noContact ? ` · ${noContact} with no one to ask` : ''}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-trs-subtle" />
              <input id="insurers-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search insurers, products, people" aria-label="Search insurers"
                className="h-9 w-[260px] sm:w-[320px] rounded border bg-white pl-11 pr-9 text-body outline-none focus:border-trs-ink border-trs-line-2"  />
              {q && <Btn level="tertiary" size="xs" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 p-0 rounded-full border-0 hover:bg-trs-field"><X size={13} /></Btn>}
            </label>
            <select id="insurers-line" value={line} onChange={e => setLine(e.target.value)} aria-label="Product line" className="h-9 rounded border bg-white px-3 text-body cursor-pointer border-trs-line-2 text-trs-ink">
              <option value="">All lines</option>
              {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
            </select>
            <Btn onClick={() => setAdding('insurer')}>Add insurer</Btn>
            <Btn level="primary" onClick={() => setAdding('product')}>Add product</Btn>
          </div>
        </div>

        {adding && (
          <AddBar mode={adding} insurers={insurers} defaultLine={line} onClose={() => setAdding(null)}
            onInsurer={ins => { setInsurers(xs => [...xs.filter(x => x.id !== ins.id), { ...ins, domain: null }].sort((a, b) => a.name.localeCompare(b.name))); setAdding('product') }}
            onProduct={p => { setRows(rs => [...(rs ?? []), { ...p, stats: { asked: 0, quoted: 0, declined: 0, won: 0, avg_days: null, last_asked: null, declined_industries: [] } }]); setOpen(p.id); setAdding(null) }} />
        )}

        {error && <p className="mt-4 text-body text-trs-neg">{error}</p>}
        <div className="mt-5"><Segmented<'products' | 'declines'> value={view} onChange={setView} options={[{ value: 'products', label: 'Products' }, { value: 'declines', label: 'Declines' }]} /></div>
        {view === 'declines' && <div className="mt-4"><DeclinesRegister q={q} line={line} /></div>}
        <div className="mt-6" hidden={view !== 'products'}>
          {!rows ? <Spinner label="Loading insurers…" /> : (
            <>
            <Register label="Insurer products" minWidth={1240}>
              <RegisterHead>
                <RegisterTh first>Product</RegisterTh>
                <RegisterTh align="center">Line</RegisterTh>
                <RegisterTh align="center">Takes</RegisterTh>
                <RegisterTh align="center">Won&apos;t take</RegisterTh>
                <RegisterTh align="center">Min premium</RegisterTh>
                <RegisterTh align="center">Max lives</RegisterTh>
                <RegisterTh align="center">Gets the request</RegisterTh>
                <RegisterTh align="center">People</RegisterTh>
                <RegisterTh align="center" hint="Requests sent in the last 12 months">Asked</RegisterTh>
                <RegisterTh align="center">Quoted</RegisterTh>
                <RegisterTh align="center" hint="Times the client chose this product">Won</RegisterTh>
                <RegisterTh align="center" hint="Average days from request to first quote">Days</RegisterTh>
                <RegisterTh align="center" last>Status</RegisterTh>
              </RegisterHead>
              <tbody>
                {groups.length === 0 && <RegisterEmpty colSpan={COLS}>{total === 0 ? 'No products yet. Add an insurer, then the products you ask it for.' : 'Nothing matches.'}</RegisterEmpty>}
                {groups.map(([insurer, rs]) => (
                  <Fragment key={insurer}>
                    <RegisterGroupRow colSpan={COLS}>{insurer}<span className="ml-2 font-normal text-trs-muted">{rs.length} product{rs.length === 1 ? '' : 's'}</span>
                      {rs[0]?.insurer_company_id && <Link href={`/insurers/${rs[0].insurer_company_id}`} className="ml-3 font-normal underline underline-offset-4 text-trs-ink">Threads</Link>}</RegisterGroupRow>
                    {rs.map(r => {
                      const def = r.contacts.find(c => c.is_default) ?? r.contacts[0] ?? null
                      const isOpen = open === r.id
                      return (
                        <Fragment key={r.id}>
                          <RegisterRow selected={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                            <RegisterCell first selected={isOpen} primary={r.name} />
                            <RegisterCell align="center">{productLineLabel(r.product_line)}</RegisterCell>
                            <RegisterCell align="center">{short(r.accepts)}</RegisterCell>
                            <RegisterCell align="center">{short(r.declines)}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.min_premium == null ? dash : num(r.min_premium, 0)}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.max_lives ?? dash}</RegisterCell>
                            <RegisterCell align="center">{def ? <span title={def.email}>{def.name ?? def.email}</span> : <span className="text-trs-neg">No one</span>}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.contacts.length}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.asked || dash}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.asked ? r.stats.quoted : dash}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.won || dash}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.avg_days == null ? dash : r.stats.avg_days.toFixed(1)}</RegisterCell>
                            <RegisterCell align="center" last><span className={r.status === 'active' ? 'text-trs-ink' : 'text-trs-muted'}>{r.status === 'active' ? 'Active' : 'Paused'}</span></RegisterCell>
                          </RegisterRow>
                          {isOpen && (
                            <tr><td colSpan={COLS} className="p-0 border-b border-trs-line">
                              <ProductEditor product={r} onSaved={saved} onClose={() => setOpen(null)} />
                            </td></tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </Register>
            {insurers.length > 0 && (
              <section className="mt-10">
                <h2 className="m-0 mb-3 text-heading font-semibold">Email threads by insurer</h2>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-body">
                  {insurers.map(i => <Link key={i.id} href={`/insurers/${i.id}`} className="no-underline hover:underline text-trs-ink">{i.name}</Link>)}
                </div>
              </section>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** One line of inputs above the grid: a new insurer, or a new product for an insurer. */
function AddBar({ mode, insurers, defaultLine, onClose, onInsurer, onProduct }: {
  mode: 'insurer' | 'product'; insurers: Insurer[]; defaultLine: string; onClose: () => void
  onInsurer: (i: { id: string; name: string }) => void; onProduct: (p: InsurerProduct) => void
}) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [insurerId, setInsurerId] = useState('')
  const [line, setLine] = useState(defaultLine || 'wica')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    setBusy(true); setError(null)
    try {
      if (mode === 'insurer') onInsurer(unwrap(await addInsurer(name, domain || null)) as never)
      else onProduct(unwrap(await addProduct({ insurer_company_id: insurerId, product_line: line, name })).product as InsurerProduct)
      setName('')
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const ready = name.trim() && (mode === 'insurer' || insurerId)
  return (
    <div className="mt-6 flex items-center gap-2 flex-wrap rounded px-3 py-2 border border-trs-line bg-trs-tint">
      <span className="text-body font-medium mr-1">{mode === 'insurer' ? 'New insurer' : 'New product'}</span>
      {mode === 'insurer' ? (
        <>
          <input id="add-insurer-name" className={`${cell} w-[240px]`} placeholder="Insurer name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input id="add-insurer-domain" className={`${cell} w-[200px]`} placeholder="Email domain, e.g. msig.com.sg" value={domain} onChange={e => setDomain(e.target.value)} />
        </>
      ) : (
        <>
          <select id="add-product-insurer" className={`${cell} w-[220px]`} value={insurerId} onChange={e => setInsurerId(e.target.value)} autoFocus>
            <option value="">Insurer…</option>
            {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select id="add-product-line" className={`${cell} w-[240px]`} value={line} onChange={e => setLine(e.target.value)}>
            {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
          <input id="add-product-name" className={`${cell} w-[220px]`} placeholder="Product name, e.g. WICA Plus" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ready) void submit() }} />
        </>
      )}
      <Btn level="primary" size="xs" onClick={submit} loading={busy} disabled={!ready}>{mode === 'insurer' ? 'Add insurer' : 'Add product'}</Btn>
      <Btn size="xs" onClick={onClose} disabled={busy}>Cancel</Btn>
      {error && <span className="text-body text-trs-neg">{error}</span>}
    </div>
  )
}
