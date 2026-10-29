'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Btn, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterGroupRow, RegisterEmpty } from '@/components/ui/register'
import { ProductEditor } from '@/components/insurers/ProductEditor'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'
import type { InsurerProduct, ProductStats } from '@/lib/placement/rank'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'

type Row = InsurerProduct & { stats: ProductStats }
type Insurer = { id: string; name: string; domain: string | null }
const COLS = 13
const cell = 'h-8 rounded-[6px] border border-[#d5d9d4] bg-white px-2 text-[13px] text-[#0f1412] outline-none focus:border-[#0f1412] placeholder:text-[#8c958f]'
const dash = <span style={{ color: '#8c958f' }}>—</span>
const money = (n: number | null) => n == null ? dash : n.toLocaleString('en-SG', { maximumFractionDigits: 0 })
const short = (xs: string[]) => xs.length === 0 ? dash : <span title={xs.join(', ')}>{xs.slice(0, 2).join(', ')}{xs.length > 2 ? ` +${xs.length - 2}` : ''}</span>

/**
 * Insurers: who we can ask for what. Every insurer, each product it offers per line, what the
 * product will and will not take, and the person a request goes to. The router suggests insurers
 * for a quote request only from here. Asked, quoted, won and days to quote fill in from requests.
 */
export default function InsurersPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [insurers, setInsurers] = useState<Insurer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [line, setLine] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<null | 'insurer' | 'product'>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await callApi<{ insurers: Insurer[]; products: Row[] }>('/api/insurers/products')
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
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Insurers</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {rows ? `${new Set(rows.map(r => r.insurer_company_id)).size} insurers · ${total} products${noContact ? ` · ${noContact} with no one to ask` : ''}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6f7a74' }} />
              <input id="insurers-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search insurers, products, people" aria-label="Search insurers"
                className="h-12 w-[260px] sm:w-[320px] rounded-[12px] border bg-white pl-11 pr-9 text-[15px] outline-none focus:border-[#0f1412]" style={{ borderColor: '#d5d9d4' }} />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f2ee]" style={{ color: MUTED }}><X size={13} /></button>}
            </label>
            <select id="insurers-line" value={line} onChange={e => setLine(e.target.value)} aria-label="Product line" className="h-12 rounded-[12px] border bg-white px-3 text-[15px] cursor-pointer" style={{ borderColor: '#d5d9d4', color: INK }}>
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

        {error && <p className="mt-4 text-[13px]" style={{ color: ERROR }}>{error}</p>}
        <div className="mt-6">
          {!rows ? <Spinner label="Loading insurers…" /> : (
            <>
            <Register label="Insurer products" minWidth={1240}>
              <RegisterHead>
                <RegisterTh first>Product</RegisterTh>
                <RegisterTh align="center">Line</RegisterTh>
                <RegisterTh align="center">Takes</RegisterTh>
                <RegisterTh align="center">Won't take</RegisterTh>
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
                    <RegisterGroupRow colSpan={COLS}>{insurer}<span className="ml-2 font-normal" style={{ color: MUTED }}>{rs.length} product{rs.length === 1 ? '' : 's'}</span>
                      {rs[0]?.insurer_company_id && <Link href={`/insurers/${rs[0].insurer_company_id}`} className="ml-3 font-normal underline underline-offset-4" style={{ color: INK }}>Threads</Link>}</RegisterGroupRow>
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
                            <RegisterCell align="center" className="tabular-nums">{money(r.min_premium)}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.max_lives ?? dash}</RegisterCell>
                            <RegisterCell align="center">{def ? <span title={def.email}>{def.name ?? def.email}</span> : <span style={{ color: ERROR }}>No one</span>}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.contacts.length}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.asked || dash}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.asked ? r.stats.quoted : dash}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.won || dash}</RegisterCell>
                            <RegisterCell align="center" className="tabular-nums">{r.stats.avg_days == null ? dash : r.stats.avg_days.toFixed(1)}</RegisterCell>
                            <RegisterCell align="center" last><span style={{ color: r.status === 'active' ? INK : MUTED }}>{r.status === 'active' ? 'Active' : 'Paused'}</span></RegisterCell>
                          </RegisterRow>
                          {isOpen && (
                            <tr><td colSpan={COLS} className="p-0" style={{ borderBottom: '1px solid #e6e8e4' }}>
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
                <h2 className="m-0 mb-3 text-[16px] font-medium">Email threads by insurer</h2>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
                  {insurers.map(i => <Link key={i.id} href={`/insurers/${i.id}`} className="no-underline hover:underline" style={{ color: INK }}>{i.name}</Link>)}
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
      if (mode === 'insurer') onInsurer(await callApi('/api/insurers', { method: 'POST', body: { name, domain: domain || null } }))
      else onProduct((await callApi<{ product: InsurerProduct }>('/api/insurers/products', { method: 'POST', body: { insurer_company_id: insurerId, product_line: line, name } })).product)
      setName('')
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const ready = name.trim() && (mode === 'insurer' || insurerId)
  return (
    <div className="mt-6 flex items-center gap-2 flex-wrap rounded-[10px] px-3 py-2" style={{ border: '1px solid #e6e8e4', background: '#fafafa' }}>
      <span className="text-[13px] font-medium mr-1">{mode === 'insurer' ? 'New insurer' : 'New product'}</span>
      {mode === 'insurer' ? (
        <>
          <input id="add-insurer-name" className={cell} style={{ width: 240 }} placeholder="Insurer name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input id="add-insurer-domain" className={cell} style={{ width: 200 }} placeholder="Email domain, e.g. msig.com.sg" value={domain} onChange={e => setDomain(e.target.value)} />
        </>
      ) : (
        <>
          <select id="add-product-insurer" className={cell} style={{ width: 220 }} value={insurerId} onChange={e => setInsurerId(e.target.value)} autoFocus>
            <option value="">Insurer…</option>
            {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select id="add-product-line" className={cell} style={{ width: 240 }} value={line} onChange={e => setLine(e.target.value)}>
            {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
          <input id="add-product-name" className={cell} style={{ width: 220 }} placeholder="Product name, e.g. WICA Plus" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ready) void submit() }} />
        </>
      )}
      <Btn level="primary" size="xs" onClick={submit} loading={busy} disabled={!ready}>{mode === 'insurer' ? 'Add insurer' : 'Add product'}</Btn>
      <Btn size="xs" onClick={onClose} disabled={busy}>Cancel</Btn>
      {error && <span className="text-[13px]" style={{ color: ERROR }}>{error}</span>}
    </div>
  )
}
