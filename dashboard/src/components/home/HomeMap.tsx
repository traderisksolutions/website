'use client'

/**
 * The home map. Client on the left, insurer on the right, TRS between them; each bridge carries
 * its open cases, what TRS owes, what waits on each side and the drafts ready. Every count opens
 * the matching list. Below: the clients and insurers with open work. Stacks to one column on a
 * phone, where the sides become chips on each bridge.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LinkBtn, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import type { HomeData } from '@/lib/today/data'

const BRIDGES: { key: keyof HomeData['bridges']; label: string; list: string }[] = [
  { key: 'rfq', label: 'RFQ and renewals', list: '/today?bridge=rfq' },
  { key: 'claims', label: 'Claims', list: '/claims' },
  { key: 'endorsements', label: 'Endorsements and members', list: '/today?bridge=endorsements' },
]

export function HomeMap() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { callApi<HomeData>('/api/today/home').then(setData).catch(e => setError(errText(e))) }, [])
  const today = new Date().toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1180px] mx-auto w-full min-w-0 flex flex-col gap-5">
      <PageHeader title="Home"
        meta={data ? `${data.today} to go through · ${data.drafts} drafts ready · ${data.decisions} decisions · ${today}` : today}
        actions={<LinkBtn level="primary" href="/today">Start today’s list</LinkBtn>} />
      {error && <p className="m-0 text-[13.5px] text-trs-neg">{error}</p>}
      {!data && !error && <Spinner label="Loading the map…" />}
      {data && <>
        <Map data={data} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <List title="Clients in progress" count={`${data.clients.length} with open work`}
            rows={data.clients.slice(0, 8).map(c => ({
              key: c.id ?? c.name, href: c.id ? `/companies/${c.id}` : null, name: c.name, sub: c.titles.join(' · '),
              right: c.trs ? `${c.trs} TRS to act` : `${c.open} open`, warn: c.trs > 0,
            }))}
            more={data.clients.length > 8 ? { href: '/companies', label: `All ${data.clients.length} clients` } : null} />
          <List title="Insurers in progress" count={`${data.insurers.length} with open work`}
            rows={data.insurers.slice(0, 8).map(i => ({
              key: i.name, href: null, name: i.name, sub: `${i.open} open`,
              right: i.drafts ? `${i.drafts} to send` : i.waiting ? `${i.waiting} waiting` : `${i.open} open`, warn: i.drafts > 0,
            }))}
            more={data.insurers.length > 8 ? { href: '/insurers', label: `All ${data.insurers.length} insurers` } : null} />
        </div>
      </>}
    </div>
  )
}

function Map({ data }: { data: HomeData }) {
  const clients = data.clients.length
  const insurers = data.insurers.length
  return (
    <section aria-label="Client, TRS and insurer" className="rounded-[12px] border border-trs-line bg-white p-4 md:p-6">
      {/* Wide: three columns with the bridges crossing the middle. */}
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)] gap-0 items-stretch">
        <Party name="Client" sub={`${clients} with open work`} href="/companies" />
        <div className="flex flex-col justify-center gap-3 py-3 rounded-[12px] bg-trs-green px-3">
          <div className="text-center font-serif text-[22px] text-white leading-none">TRS</div>
          <div className="text-center">
            <Link href="/today" className="inline-flex items-center h-[24px] px-2.5 rounded-full bg-trs-lime text-[12px] font-semibold text-trs-green no-underline">{data.drafts} drafts ready</Link>
          </div>
          {BRIDGES.map(b => <Bridge key={b.key} label={b.label} list={b.list} x={data.bridges[b.key]} />)}
        </div>
        <Party name="Insurer" sub={`${insurers} with open work`} href="/insurers" />
      </div>
      {/* Phone and narrow tablet: one bridge per card, the sides as chips. */}
      <div className="md:hidden flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[13px] text-trs-muted"><span>Client · {clients}</span><span className="font-serif text-[18px] text-trs-ink">TRS</span><span>Insurer · {insurers}</span></div>
        {BRIDGES.map(b => <Bridge key={b.key} label={b.label} list={b.list} x={data.bridges[b.key]} stacked />)}
      </div>
    </section>
  )
}

function Party({ name, sub, href }: { name: string; sub: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center gap-1 rounded-[12px] border border-trs-line-2 mx-3 px-3 py-6 no-underline hover:border-trs-ink-2">
      <span className="font-serif text-[26px] text-trs-ink leading-none">{name}</span>
      <span className="text-[12.5px] text-trs-muted">{sub}</span>
    </Link>
  )
}

function Bridge({ label, list, x, stacked }: { label: string; list: string; x: HomeData['bridges']['rfq']; stacked?: boolean }) {
  const side = (n: number, who: string) => (
    <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11.5px] whitespace-nowrap ${n ? 'bg-trs-warn-bg text-trs-warn' : 'bg-trs-canvas text-trs-muted'}`}>{n} waiting on {who}</span>
  )
  return (
    <div className={stacked ? 'rounded-[10px] border border-trs-line px-3 py-2.5 flex flex-col gap-1.5' : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2'}>
      {!stacked && side(x.waiting_client, 'client')}
      <Link href={list} className="flex flex-col items-center rounded-[8px] bg-white px-3 py-2 no-underline hover:shadow-[0_0_0_2px_var(--trs-lime)] min-w-0">
        <span className="text-[13.5px] font-semibold text-trs-ink text-center">{label}</span>
        <span className="font-mono text-[11.5px] text-trs-muted tabular-nums">{x.open} open · {x.trs} TRS to act{x.drafts ? ` · ${x.drafts} drafts` : ''}</span>
      </Link>
      {!stacked && side(x.waiting_insurer, 'insurer')}
      {stacked && <div className="flex flex-wrap gap-1.5">{side(x.waiting_client, 'client')}{side(x.waiting_insurer, 'insurer')}</div>}
    </div>
  )
}

function List({ title, count, rows, more }: {
  title: string; count: string
  rows: { key: string; href: string | null; name: string; sub: string; right: string; warn: boolean }[]
  more: { href: string; label: string } | null
}) {
  return (
    <section className="rounded-[10px] border border-trs-line bg-white overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-trs-line">
        <h2 className="m-0 font-serif text-[19px] font-medium text-trs-ink">{title}</h2>
        <span className="text-[12.5px] text-trs-muted">{count}</span>
      </div>
      {rows.length === 0 && <p className="m-0 px-4 py-3 text-[13.5px] text-trs-muted">None.</p>}
      {rows.map(r => {
        const body = <>
          <span className="min-w-0"><span className="block text-[13.5px] text-trs-ink truncate">{r.name}</span><span className="block text-[12px] text-trs-muted truncate">{r.sub}</span></span>
          <span className={`text-[12px] whitespace-nowrap ${r.warn ? 'text-trs-neg' : 'text-trs-muted'}`}>{r.right}</span>
        </>
        const cls = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 border-b border-trs-line last:border-b-0'
        return r.href
          ? <Link key={r.key} href={r.href} className={`${cls} no-underline hover:bg-trs-canvas`}>{body}</Link>
          : <div key={r.key} className={cls}>{body}</div>
      })}
      {more && <div className="px-4 py-2 border-t border-trs-line"><Link href={more.href} className="text-[13px] text-trs-muted">{more.label}</Link></div>}
    </section>
  )
}
