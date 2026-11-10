'use client'

/**
 * Home: the to-do (every item that needs a person, worked in place), then the canvas of the work (client, TRS and insurer joined by three bridges, every open case
 * as a card on the side that owes the next move), then the clients and insurers with open work.
 * The pinned-company board moved to /board.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LinkBtn, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { HomeCanvas } from './HomeCanvas'
import { TodoList } from './TodoList'
import type { HomeData, HomeCanvas as Canvas } from '@/lib/today/data'

type Staff = { email: string; name: string }
type Home = HomeData & { canvas: Canvas }

export function HomeMap() {
  const [data, setData] = useState<Home | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const load = useCallback(() => callApi<Home>('/api/today/home').then(setData).catch(e => setError(errText(e))), [])
  useEffect(() => { void load(); callApi<{ staff: Staff[] }>('/api/today/edit-options').then(d => setStaff(d.staff)).catch(() => {}) }, [load])
  const today = new Date().toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
  const c = data?.canvas

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1180px] mx-auto w-full min-w-0 flex flex-col gap-5">
      <PageHeader title="Home"
        meta={c ? `${c.open} open · ${c.drafts} drafts ready · ${c.decisions} decisions · ${c.red} lapsed · ${today}` : today}
        actions={<LinkBtn level="primary" href="/today">Start today’s list</LinkBtn>} />
      {error && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      {notice && <p className="m-0 text-[13.5px] text-trs-ink" role="status">{notice}</p>}
      {!data && !error && <Spinner label="Loading the map…" />}
      <TodoList />
      {data && c && <>
        <HomeCanvas data={c} staff={staff} onChanged={m => { setNotice(m); setError(null); void load() }} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <List title="Clients in progress" count={`${data.clients.length} with open work`}
            rows={data.clients.slice(0, 8).map(x => ({
              key: x.id ?? x.name, href: x.id ? `/companies/${x.id}` : null, name: x.name, sub: x.titles.join(' · '),
              right: x.trs ? `${x.trs} TRS to act` : `${x.open} open`, warn: x.trs > 0,
            }))}
            more={data.clients.length > 8 ? { href: '/companies', label: `All ${data.clients.length} clients` } : null} />
          <List title="Insurers in progress" count={`${data.insurers.length} with open work`}
            rows={data.insurers.slice(0, 8).map(i => ({
              key: i.name, href: `/insurers?q=${encodeURIComponent(i.name)}`, name: i.name, sub: `${i.open} open`,
              right: i.drafts ? `${i.drafts} to send` : i.waiting ? `${i.waiting} waiting` : `${i.open} open`, warn: i.drafts > 0,
            }))}
            more={data.insurers.length > 8 ? { href: '/insurers', label: `All ${data.insurers.length} insurers` } : null} />
        </div>
      </>}
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
