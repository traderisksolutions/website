'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PmCompareTable } from '@/components/pricing-matrix/PmCompareTable'
import type { CompareInsurer } from '@/lib/pm-compare'
import { Spinner } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'

type Avail = { id: string; insurer_name: string }

/** Compare coverage: pick two or more approved insurers, then the wording side by side. */
export default function ComparePage() {
  const [avail, setAvail] = useState<Avail[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [data, setData] = useState<CompareInsurer[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetch('/api/pricing-matrix/quote/available', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(setAvail) }, [])

  const ids = Object.keys(selected).filter(id => selected[id])

  async function compare() {
    setLoading(true); setData(null)
    const res = await fetch(`/api/pricing-matrix/compare?ids=${ids.join(',')}`, { cache: 'no-store' })
    setData(res.ok ? await res.json() : [])
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Pricing Matrix</Link>
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-[640px]">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Compare coverage</h1>
            <p className="m-0 mt-2 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{avail.length} approved calculator{avail.length === 1 ? '' : 's'}{ids.length ? ` · ${ids.length} selected` : ''}</p>
          </div>
          {avail.length > 0 && (
            <button type="button" onClick={compare} disabled={ids.length < 2 || loading} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: INK }}>
              {loading ? 'Comparing…' : 'Compare'}
            </button>
          )}
        </div>

        {avail.length === 0 ? (
          <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No approved calculators yet.</p>
        ) : (
          <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Insurers to compare">
            {avail.map(a => {
              const on = !!selected[a.id]
              return (
                <label key={a.id} className={cn('inline-flex items-center h-10 px-4 rounded-[10px] text-[14px] cursor-pointer select-none border', on ? 'font-medium bg-[#f1f3f4]' : 'bg-white hover:bg-[#f8f9fa]')} style={{ borderColor: on ? INK : '#dadce0', color: INK }}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setSelected(s => ({ ...s, [a.id]: !s[a.id] }))} />
                  {a.insurer_name}
                </label>
              )
            })}
          </div>
        )}

        {loading && <Spinner label="Aligning coverage terms…" />}
        {data && <div className="mt-6"><PmCompareTable insurers={data} /></div>}
      </div>
    </div>
  )
}
