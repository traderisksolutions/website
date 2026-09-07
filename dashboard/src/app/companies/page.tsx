'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { AppSplitLayout, AppMainPanel, AppPageHeader, AppPageBody } from '@/components/app-shell'
import { DataTableToolbar, DataTableSearch } from '@/components/data-table/toolbar'

/**
 * The company hub's entry list — supersedes the old Companies tab inside /contacts
 * (CompaniesTab.tsx, left in place for now as a lightweight secondary view; see the Phase 1
 * plan). Rows navigate to the full /companies/[id] page instead of a slide-over.
 */

type CompanyRow = { id: string; name: string; address: string | null; type: string | null; domain: string | null }

export default function CompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/companies${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((rows: CompanyRow[]) => setCompanies(Array.isArray(rows) ? rows : []))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  return (
    <AppSplitLayout>
      <AppMainPanel>
        <AppPageHeader
          title="Companies"
          description={loading ? 'Loading…' : `${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`}
        />
        <DataTableToolbar>
          <DataTableSearch value={q} onChange={setQ} placeholder="Search companies…" />
        </DataTableToolbar>
        <AppPageBody padded={false}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[--border-subtle] text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
                <th className="text-left px-4 py-2 font-semibold">Company</th>
                <th className="text-left px-3 py-2 font-semibold">Address</th>
                <th className="text-left px-3 py-2 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[--border-subtle]"><td colSpan={3} className="px-4 h-11"><div className="skeleton sk-cell" style={{ width: '60%', height: 10 }} /></td></tr>
              ))}
              {!loading && companies.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">No companies yet — they're created from Debit Note generation or PDF import.</td></tr>
              )}
              {!loading && companies.map(c => (
                <tr key={c.id} onClick={() => router.push(`/companies/${c.id}`)} className="border-b border-[--border-subtle] hover:bg-accent/40 cursor-pointer">
                  <td className="px-4 py-2.5 font-medium flex items-center gap-1.5"><Building2 size={13} className="text-muted-foreground/50" /> <span className="uppercase">{c.name}</span></td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[280px]">{c.address ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.type ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AppPageBody>
      </AppMainPanel>
    </AppSplitLayout>
  )
}
