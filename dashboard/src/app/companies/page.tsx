'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Link2, Reply, ArrowUpRight } from 'lucide-react'
import { AppScrollPage } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { StageBadge, Btn, LinkBtn, Segmented, Chip, Spinner, inputCls } from '@/components/crm/primitives'
import { fmtMoney, fmtRelative, fmtDate } from '@/lib/crm/format'
import { STAGES, STAGE_LABEL, type CompanySummaryRow, type Stage } from '@/lib/crm/types'

type StageFilter = 'all' | Stage

export default function CompaniesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<CompanySummaryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<StageFilter>('all')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/companies?view=summary', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not load companies.')
      setRows(d.rows)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]) }
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 }
    for (const s of STAGES) c[s] = rows?.filter(r => r.stage === s).length ?? 0
    return c
  }, [rows])

  const visible = useMemo(() => {
    let v = rows ?? []
    if (stage !== 'all') v = v.filter(r => r.stage === stage)
    if (q.trim()) { const s = q.trim().toLowerCase(); v = v.filter(r => r.name.toLowerCase().includes(s) || r.domains.some(d => d.includes(s)) || (r.owner_email ?? '').includes(s)) }
    return v
  }, [rows, stage, q])

  return (
    <AppScrollPage maxWidth="1240px">
      <PageHeader
        title="Companies"
        description={rows ? `${rows.length} client compan${rows.length === 1 ? 'y' : 'ies'}. Everything about a client lives on its page.` : 'Loading…'}
        className="mb-4"
        actions={
          <>
            <LinkBtn level="tertiary" href="/companies/triage"><Link2 size={12} /> Link threads</LinkBtn>
            <Btn level="primary" onClick={() => setCreating(true)}><Plus size={12} /> New company</Btn>
          </>
        }
      />

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <Segmented value={stage} onChange={setStage} options={[{ value: 'all' as StageFilter, label: 'All', count: counts.all }, ...STAGES.map(s => ({ value: s as StageFilter, label: STAGE_LABEL[s], count: counts[s] }))]} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, domain or owner…" className={`${inputCls} sm:max-w-[260px] sm:ml-auto`} />
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {!rows && <Spinner label="Loading companies…" />}

      {rows && visible.length === 0 && (
        <div className="rounded-lg bg-card px-6 py-12 text-center" style={{ boxShadow: 'var(--card-shadow)' }}>
          <Building2 size={22} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-[13px] font-medium m-0">{rows.length === 0 ? 'No companies yet' : 'Nothing matches'}</p>
          <p className="text-[12px] text-muted-foreground mt-1 m-0">{rows.length === 0 ? 'Add one, or link incoming email threads to create companies from them.' : 'Try a different stage or search.'}</p>
          {rows.length === 0 && <div className="mt-4 flex justify-center gap-2"><Btn level="primary" onClick={() => setCreating(true)}><Plus size={12} /> New company</Btn><LinkBtn href="/companies/triage"><Link2 size={12} /> Link threads</LinkBtn></div>}
        </div>
      )}

      {rows && visible.length > 0 && (
        <>
          {/* Desktop and tablet: table */}
          <div className="hidden md:block rounded-lg bg-card overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[860px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ background: 'var(--table-header-bg)' }}>
                    <th className="text-left px-4 py-2.5 font-semibold">Company</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Stage</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Threads</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Outstanding</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Next renewal</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Actions</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => <Row key={r.id} r={r} onOpen={() => router.push(`/companies/${r.id}`)} />)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phone: cards */}
          <ul className="md:hidden m-0 p-0 list-none flex flex-col gap-2">
            {visible.map(r => (
              <li key={r.id}>
                <Link href={`/companies/${r.id}`} className="block rounded-lg bg-card px-4 py-3 no-underline text-foreground" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13.5px] font-semibold m-0 leading-tight">{r.name}</p>
                    <StageBadge stage={r.stage} />
                  </div>
                  <p className="text-[11.5px] text-muted-foreground m-0 mt-1">{r.owner_email ? r.owner_email.split('@')[0] : 'No owner'} · {r.openThreads} thread{r.openThreads === 1 ? '' : 's'} · {fmtRelative(r.lastActivityAt)}</p>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {r.needsReply > 0 && <Chip tone="amber"><Reply size={10} /> {r.needsReply} awaiting reply</Chip>}
                    {r.money.map(m => <Chip key={m.currency} tone={m.overdue > 0 ? 'red' : 'neutral'}>{fmtMoney(m.overdue > 0 ? m.overdue : m.outstanding, m.currency, { compact: true })} {m.overdue > 0 ? 'overdue' : 'outstanding'}</Chip>)}
                    {r.nextRenewalDate && <Chip tone="neutral">Renews {fmtRelative(r.nextRenewalDate)}</Chip>}
                    {r.proposedActions > 0 && <Chip tone="blue">{r.proposedActions} to review</Chip>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <NewCompanyDialog open={creating} onClose={() => setCreating(false)} />
    </AppScrollPage>
  )
}

function Row({ r, onOpen }: { r: CompanySummaryRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="border-b border-[--border-subtle] hover:bg-muted/40 cursor-pointer">
      <td className="px-4 py-2.5">
        <p className="font-semibold m-0 leading-tight flex items-center gap-1.5"><span className="truncate max-w-[320px]">{r.name}</span><ArrowUpRight size={11} className="text-muted-foreground/40" /></p>
        <p className="text-[11px] text-muted-foreground m-0 mt-0.5 truncate max-w-[320px]">{[r.owner_email?.split('@')[0], r.domains[0], r.industry].filter(Boolean).join(' · ') || 'No owner or domain yet'}</p>
      </td>
      <td className="px-3 py-2.5">
        <StageBadge stage={r.stage} />
        {r.suggestedStage && <p className="text-[10.5px] text-muted-foreground m-0 mt-0.5">suggested: {STAGE_LABEL[r.suggestedStage]}</p>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.openThreads}
        {r.needsReply > 0 && <span className="block text-[10.5px] font-semibold" style={{ color: 'var(--warning)' }}>{r.needsReply} awaiting reply</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.money.length === 0 ? <span className="text-muted-foreground">—</span> : r.money.map(m => (
          <span key={m.currency} className="block">
            {fmtMoney(m.outstanding, m.currency)}
            {m.overdue > 0 && <span className="block text-[10.5px] font-semibold" style={{ color: 'var(--error)' }}>{fmtMoney(m.overdue, m.currency)} overdue</span>}
          </span>
        ))}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">{r.nextRenewalDate ? <>{fmtDate(r.nextRenewalDate)}<span className="block text-[10.5px] text-muted-foreground">{fmtRelative(r.nextRenewalDate)}</span></> : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.openActions}
        {r.proposedActions > 0 && <span className="block text-[10.5px] font-semibold" style={{ color: 'var(--primary-hex)' }}>{r.proposedActions} to review</span>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{fmtRelative(r.lastActivityAt)}</td>
    </tr>
  )
}
