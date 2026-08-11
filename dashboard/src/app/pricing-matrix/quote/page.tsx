'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, FileText, Users, Building2 } from 'lucide-react'
import { MetricCard, MetricGrid } from '@/components/shared/metric-card'
import { TableShell, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shared/table-shell'

type Row = { id: string; company_name: string | null; effective_date: string | null; member_count: number; calculator_ids: string[]; created_at: string }

export default function QuotesListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/pricing-matrix/quote', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(d => { setRows(d); setLoading(false) }) }, [])

  const totalLives = rows.reduce((s, r) => s + (r.member_count ?? 0), 0)
  const companies = new Set(rows.map(r => r.company_name).filter(Boolean)).size

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Pricing Matrix</Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold text-foreground">Quotes</h1>
        <Link href="/pricing-matrix/quote/new" className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={15} /> New quote</Link>
      </div>

      {!loading && rows.length > 0 && (
        <MetricGrid className="mb-5 md:grid-cols-3">
          <MetricCard label="Quotes" value={rows.length} icon={FileText} />
          <MetricCard label="Client companies" value={companies} icon={Building2} />
          <MetricCard label="Total lives quoted" value={totalLives} icon={Users} />
        </MetricGrid>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-16 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border border-dashed border-border rounded-xl">
          <FileText size={24} className="mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm">No quotes yet. Run a census across your insurer calculators.</p>
        </div>
      ) : (
        <TableShell>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead><TableHead>Lives</TableHead><TableHead>Insurers</TableHead><TableHead>Effective</TableHead><TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell><Link href={`/pricing-matrix/quote/${r.id}`} className="font-medium text-foreground hover:text-primary">{r.company_name || 'Untitled'}</Link></TableCell>
                <TableCell className="text-muted-foreground/80">{r.member_count}</TableCell>
                <TableCell className="text-muted-foreground/80">{r.calculator_ids?.length ?? 0}</TableCell>
                <TableCell className="text-muted-foreground/70">{r.effective_date ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground/50">{new Date(r.created_at).toLocaleDateString('en-SG')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      )}
    </div>
  )
}
