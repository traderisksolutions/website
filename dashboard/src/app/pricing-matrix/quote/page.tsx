'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, FileText } from 'lucide-react'

type Row = { id: string; company_name: string | null; effective_date: string | null; member_count: number; calculator_ids: string[]; created_at: string }

export default function QuotesListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/pricing-matrix/quote', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(d => { setRows(d); setLoading(false) }) }, [])

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold text-foreground">Quotes</h1>
        <Link href="/pricing-matrix/quote/new" className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={15} /> New quote</Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-16 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border border-dashed border-border rounded-xl">
          <FileText size={24} className="mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm">No quotes yet. Run a census across your insurer calculators.</p>
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/60 border-b border-border">
              <th className="py-2 pr-3 font-medium">Company</th><th className="py-2 pr-3 font-medium">Lives</th><th className="py-2 pr-3 font-medium">Insurers</th><th className="py-2 pr-3 font-medium">Effective</th><th className="py-2 pr-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
                <td className="py-2.5 pr-3"><Link href={`/pricing-matrix/quote/${r.id}`} className="font-medium text-foreground hover:text-primary">{r.company_name || 'Untitled'}</Link></td>
                <td className="py-2.5 pr-3 text-muted-foreground/80">{r.member_count}</td>
                <td className="py-2.5 pr-3 text-muted-foreground/80">{r.calculator_ids?.length ?? 0}</td>
                <td className="py-2.5 pr-3 text-muted-foreground/70">{r.effective_date ?? '—'}</td>
                <td className="py-2.5 pr-3 text-muted-foreground/50">{new Date(r.created_at).toLocaleDateString('en-SG')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
