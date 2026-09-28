'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TableShell, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shared/table-shell'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

type Row = { id: string; company_name: string | null; effective_date: string | null; member_count: number; calculator_ids: string[]; created_at: string }

/** Quotes: every saved quote, newest first. Title, count line, search, one primary, the table. */
export default function QuotesListPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  useEffect(() => { fetch('/api/pricing-matrix/quote', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(d => { setRows(d); setLoading(false) }) }, [])

  const totalLives = rows.reduce((s, r) => s + (r.member_count ?? 0), 0)
  const companies = new Set(rows.map(r => r.company_name).filter(Boolean)).size
  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r => !needle || (r.company_name ?? '').toLowerCase().includes(needle))

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/pricing-matrix" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Pricing Matrix</Link>
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Quotes</h1>
            <p className="m-0 mt-2 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{loading ? 'Loading…' : `${rows.length} quote${rows.length === 1 ? '' : 's'} · ${companies} compan${companies === 1 ? 'y' : 'ies'} · ${totalLives} lives`}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies" aria-label="Search quotes" className="h-12 w-[220px] rounded-[12px] border bg-white px-4 text-[15px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0' }} />
            <Link href="/pricing-matrix/quote/new" className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium no-underline inline-flex items-center whitespace-nowrap hover:opacity-90" style={{ background: INK }}>New quote</Link>
          </div>
        </div>

        <div className="mt-8">
          {loading ? (
            <div className="rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }} aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[52px] px-4 flex items-center" style={{ borderBottom: `1px solid ${RULE}` }}><span className="h-3.5 w-48 rounded bg-[#f1f3f4] animate-pulse" /></div>)}</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="m-0 text-[15px]" style={{ color: MUTED }}>No quotes yet.</p>
              <Link href="/pricing-matrix/quote/new" className="mt-4 inline-flex items-center h-10 px-4 rounded-[10px] bg-white text-[14px] border no-underline hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>New quote</Link>
            </div>
          ) : (
              <TableShell label="Quotes">
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Lives</TableHead>
                    <TableHead className="text-right">Insurers</TableHead>
                    <TableHead className="text-right">Effective</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map(r => (
                    <TableRow key={r.id} tabIndex={0} onClick={() => router.push(`/pricing-matrix/quote/${r.id}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/pricing-matrix/quote/${r.id}`) } }} className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]">
                      <TableCell className="min-w-[220px] max-w-[340px]">
                        <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{r.company_name || 'Untitled'}</span>
                        <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{r.calculator_ids?.length ?? 0} insurer{(r.calculator_ids?.length ?? 0) === 1 ? '' : 's'} quoted</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        <span className="block" style={{ color: INK }}>{r.member_count}</span>
                        <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>{r.member_count === 1 ? 'life' : 'lives'}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap" style={{ color: INK }}>{r.calculator_ids?.length ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap" style={{ color: INK }}>{r.effective_date ?? <span style={{ color: '#9aa0a6' }}>—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap" style={{ color: MUTED }}>{new Date(r.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</TableCell>
                    </TableRow>
                  ))}
                  {shown.length === 0 && <TableRow><TableCell colSpan={5} className="py-16 text-center text-[15px]" style={{ color: MUTED }}>No quotes match.</TableCell></TableRow>}
                </TableBody>
              </TableShell>
          )}
        </div>
      </div>
    </div>
  )
}
