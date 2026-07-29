'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Scale } from 'lucide-react'
import { PmCompareTable } from '@/components/pricing-matrix/PmCompareTable'
import type { CompareInsurer } from '@/lib/pm-compare'

type Avail = { id: string; insurer_name: string }

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
    <div className="max-w-6xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>
      <h1 className="text-[18px] font-semibold text-foreground mb-1 flex items-center gap-2"><Scale size={17} className="text-primary" /> Compare coverage</h1>
      <p className="text-[12.5px] text-muted-foreground/80 mb-5">Pick two or more insurers to see what&rsquo;s actually covered side by side — not just the price.</p>

      {avail.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">No approved calculators yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {avail.map(a => (
            <label key={a.id} className={`text-[12.5px] px-3 py-1.5 rounded-lg border cursor-pointer ${selected[a.id] ? 'border-primary/40 bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
              <input type="checkbox" className="hidden" checked={!!selected[a.id]} onChange={() => setSelected(s => ({ ...s, [a.id]: !s[a.id] }))} />
              {a.insurer_name}
            </label>
          ))}
          <button onClick={compare} disabled={ids.length < 2 || loading} className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />} Compare {ids.length > 0 ? `(${ids.length})` : ''}
          </button>
        </div>
      )}

      {data && <PmCompareTable insurers={data} />}
    </div>
  )
}
