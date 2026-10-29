'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { Segmented, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { EnquiryDrawer } from '@/components/sales/EnquiryDrawer'
import { PRODUCT_LABEL, answerLabel } from '@/lib/intake/labels'
import { bookingLabel, fmtWhen } from '@/lib/intake/format'

const INK = '#0f1412'
const MUTED = '#4a5550'

type Site = { id: string; key: string; name: string; domain: string }
type Row = {
  id: string; status: string; company_name: string | null; contact_name: string | null; email: string | null; phone: string | null
  industry: string | null; product_requests: { product: string }[]; flags: string[]
  booking: { day?: string; time?: string; format?: string } | null; submitted_at: string | null; updated_at: string
}
type Payload = { site: string; sites: Site[]; counts: Record<string, { total: number; open: number }>; rows: Row[] }

const STATUS_LABEL: Record<string, string> = { partial: 'Unfinished', submitted: 'New', contacted: 'Contacted', met: 'Met', quoted: 'Quoted', won: 'Won', lost: 'Lost' }
const STATUS_FILTERS: [string, string][] = [['all', 'Any status'], ['open', 'Open'], ['submitted', 'New'], ['partial', 'Unfinished'], ['contacted', 'Contacted'], ['met', 'Met'], ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost']]

export default function EnquiriesPage() {
  return <Suspense fallback={null}><Enquiries /></Suspense>
}

/** Enquiries: what buyers submit on each website, one switch per site. Opening a row shows every answer. */
function Enquiries() {
  const router = useRouter()
  const search = useSearchParams()
  const site = search.get('site') ?? 'corpcover'
  const status = search.get('status') ?? 'all'
  const open = search.get('id')
  const [q, setQ] = useState(search.get('q') ?? '')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  const go = useCallback((next: { site?: string; status?: string; q?: string; id?: string | null }) => {
    const p = new URLSearchParams()
    const v = { site, status, q: search.get('q') ?? '', id: open, ...next }
    if (v.site !== 'corpcover') p.set('site', v.site)
    if (v.status !== 'all') p.set('status', v.status)
    if (v.q) p.set('q', v.q)
    if (v.id) p.set('id', v.id)
    const s = p.toString()
    router.replace(`/sales/enquiries${s ? `?${s}` : ''}`, { scroll: false })
  }, [site, status, open, search, router])

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const p = new URLSearchParams({ site })
      if (status !== 'all') p.set('status', status)
      const qq = search.get('q'); if (qq) p.set('q', qq)
      const res = await fetch(`/api/sales/enquiries?${p}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load enquiries')
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [site, status, search])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (q.trim() === (search.get('q') ?? '')) return
    const t = setTimeout(() => go({ q: q.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const ids = rows.map(r => r.id)
  const idx = open ? ids.indexOf(open) : -1
  const counts = data?.counts
  const siteName = data?.sites.find(s => s.key === site)?.name ?? 'Corp Cover'
  const siteCounts = counts?.[site]

  return (
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Enquiries</h1>
          <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
            {!siteCounts ? 'Loading…' : <>{siteName} · {siteCounts.total} submission{siteCounts.total === 1 ? '' : 's'} · {siteCounts.open} new</>}
          </p>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Segmented value={site} onChange={v => go({ site: v, status: 'all', q: '', id: null })}
              options={(data?.sites ?? [{ key: 'corpcover', name: 'Corp Cover' } as Site]).map(s => ({ value: s.key, label: s.name, count: counts?.[s.key]?.total }))} />
          </div>

          <div className="mt-4 pb-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid #e6e8e4' }}>
            <label className="inline-flex">
              <span className="sr-only">Status</span>
              <select value={status} onChange={e => go({ status: e.target.value, id: null })} className={cn(inputCls, 'h-9 w-auto text-[13.5px] pr-8', status !== 'all' && 'border-[#0f1412] font-medium')}>
                {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <DataTableSearch value={q} onChange={setQ} placeholder="Search company, name, email or phone" className="flex-shrink-0" />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>
          {error && <p className="m-0 mb-4 text-[14px]" role="alert">{error}</p>}
          <Register label={`${siteName} enquiries`} minWidth={1080} className={cn(loading && 'opacity-60')}>
            <RegisterHead>
              <RegisterTh first hint="Company and the person who filled the form">Company</RegisterTh>
              <RegisterTh>Email and phone</RegisterTh>
              <RegisterTh>Industry</RegisterTh>
              <RegisterTh hint="Cover chosen in the form">Cover</RegisterTh>
              <RegisterTh hint="Preferred time and meeting format">Call</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh last align="right" hint="Submitted, or last saved for unfinished forms">Received</RegisterTh>
            </RegisterHead>
            <tbody>
              {!data && loading ? <SkeletonRows /> : rows.length === 0 ? (
                <RegisterEmpty colSpan={7}>
                  {siteCounts && siteCounts.total === 0 ? `No submissions from ${siteName} yet.` : 'No submissions match.'}
                </RegisterEmpty>
              ) : rows.map(r => {
                const on = r.id === open
                const cover = (r.product_requests ?? []).map(p => PRODUCT_LABEL[p.product] ?? p.product)
                return (
                  <RegisterRow key={r.id} selected={on} onClick={() => go({ id: on ? null : r.id })}>
                    <RegisterCell first selected={on} identityWidth={240}
                      primary={r.company_name ?? <span style={{ color: MUTED }}>No company yet</span>}
                      secondary={r.contact_name ?? '–'} />
                    <RegisterCell primary={r.email ?? <span style={{ color: MUTED }}>–</span>} secondary={r.phone ?? undefined} />
                    <RegisterCell primary={r.industry ? answerLabel('industry', r.industry) : '–'} />
                    <RegisterCell primary={cover.length ? <span className="block max-w-[260px] truncate" title={cover.join(', ')}>{cover.join(', ')}</span> : '–'}
                      secondary={r.flags?.length ? `${r.flags.length} flag${r.flags.length === 1 ? '' : 's'} for the adviser` : undefined} />
                    <RegisterCell primary={bookingLabel(r.booking) ?? '–'} secondary={r.booking?.format ? (r.booking.format === 'whatsapp' ? 'WhatsApp call' : 'Google Meet') : undefined} />
                    <RegisterCell primary={STATUS_LABEL[r.status] ?? r.status} />
                    <RegisterCell last align="right"><span className="tabular-nums" style={{ color: MUTED }}>{fmtWhen(r.submitted_at ?? r.updated_at)}</span></RegisterCell>
                  </RegisterRow>
                )
              })}
            </tbody>
          </Register>
        </div>
      </AppMainPanel>

      <EnquiryDrawer id={open} onClose={() => go({ id: null })} onChanged={load}
        onPrev={idx > 0 ? () => go({ id: ids[idx - 1] }) : undefined} onNext={idx >= 0 && idx < ids.length - 1 ? () => go({ id: ids[idx + 1] }) : undefined} />
    </AppSplitLayout>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #e6e8e4' }}>
          {[55, 50, 30, 50, 35, 20, 20].map((w, j) => (
            <td key={j} className={cn('px-3 h-14', j === 0 && 'pl-6', j === 6 && 'pr-5')}>
              <div className="h-3.5 rounded bg-[#f1f2ee] animate-pulse" style={{ width: `${w}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
