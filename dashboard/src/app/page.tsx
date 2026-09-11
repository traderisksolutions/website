'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { SectionCard, Chip, Empty, Spinner, StageBadge } from '@/components/crm/primitives'
import { fmtMoney, fmtRelative, fmtDate } from '@/lib/crm/format'
import { STAGES, STAGE_LABEL, type CompanySummaryRow, type PaymentDerived } from '@/lib/crm/types'

type Home = {
  today: string
  kpis: { needsReply: number; overdueCount: number; overdueMoney: { currency: string; outstanding: number; overdue: number }[]; renewals60d: number; unlinkedThreads: number; pendingDrafts: number; companies: number; byStage: Record<string, number> }
  needsReply: { threadId: string; subject: string | null; category: string | null; companyId: string | null; companyName: string | null; from: string; at: string }[]
  overdue: (PaymentDerived & { companyName: string | null })[]
  dueSoon: (PaymentDerived & { companyName: string | null })[]
  renewals: { policyId: string; policyNumber: string | null; insurer: string | null; classOfInsurance: string | null; endDate: string; companyId: string | null; companyName: string | null }[]
  companies: CompanySummaryRow[]
}

export default function HomePage() {
  const [data, setData] = useState<Home | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/home/crm', { cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Could not load.'); setData(d) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const k = data?.kpis
  const sgdOverdue = k?.overdueMoney.find(m => m.currency === 'SGD')?.overdue ?? 0

  const headline = k
    ? [
        k.needsReply ? `${k.needsReply} awaiting a reply` : null,
        k.overdueCount ? `${fmtMoney(sgdOverdue, 'SGD', { compact: true })} overdue across ${k.overdueCount} debit note${k.overdueCount === 1 ? '' : 's'}` : null,
        k.renewals60d ? `${k.renewals60d} renewal${k.renewals60d === 1 ? '' : 's'} within 60 days` : null,
      ].filter(Boolean).join(' · ') || 'Nothing needs attention today.'
    : 'What needs attention across every client.'

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[860px] px-6 py-6">
        <PageHeader title="Today" description={data ? fmtDate(data.today) : undefined} className="mb-2" />
        <p className="text-[13.5px] text-foreground/85 m-0">{headline}</p>
        {k && (
          <p className="text-[12px] text-muted-foreground mt-1 mb-1">
            {k.companies} compan{k.companies === 1 ? 'y' : 'ies'} · {STAGES.filter(s => (k.byStage[s] ?? 0) > 0).map(s => `${k.byStage[s]} ${STAGE_LABEL[s].toLowerCase()}`).join(', ')}
            {k.unlinkedThreads > 0 && <> · <Link href="/companies/triage" className="text-primary no-underline hover:underline">{k.unlinkedThreads} threads to link</Link></>}
          </p>
        )}

        {error && <p className="text-[12px] text-destructive">{error}</p>}
        {!data && !error && <Spinner label="Gathering today’s work…" />}

        {data && (
          <>
            <SectionCard title="Needs a reply" description="Latest message is from the client and nobody has answered." actions={<Link href="/engagement" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary no-underline hover:underline">Inbox <ArrowRight size={11} /></Link>}>
              {data.needsReply.length === 0 && <Empty compact>Inbox is clear.</Empty>}
              <ul className="m-0 p-0 list-none flex flex-col">
                {data.needsReply.slice(0, 8).map(t => (
                  <li key={t.threadId} className="border-b border-[--border-subtle] last:border-b-0">
                    <Link href={`/engagement?lead=${t.threadId}`} className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] truncate">{t.subject ?? '(no subject)'}</span>
                        <span className="block text-[11.5px] text-muted-foreground truncate">{t.companyName ?? 'No company'} · {t.from}</span>
                      </span>
                      {t.category && <Chip tone="neutral" className="capitalize hidden sm:inline-flex">{t.category}</Chip>}
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtRelative(t.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Money" description="Overdue first, then due within 14 days.">
              {data.overdue.length === 0 && data.dueSoon.length === 0 && <Empty compact>Nothing overdue or due soon.</Empty>}
              <ul className="m-0 p-0 list-none flex flex-col">
                {[...data.overdue, ...data.dueSoon].slice(0, 8).map(d => (
                  <li key={d.id} className="border-b border-[--border-subtle] last:border-b-0">
                    <Link href={`/companies/${d.company_id}?tab=payments`} className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] truncate">{d.companyName ?? 'Unknown company'} · <span className="font-mono text-[11.5px]">{d.debit_note_no}</span></span>
                        <span className="block text-[11.5px] text-muted-foreground truncate">{d.classOfInsurance ?? d.event_type ?? ''}{d.insurer ? ` · ${d.insurer}` : ''}</span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{fmtMoney(d.outstanding, d.currency)}</span>
                      <Chip tone={d.derived === 'overdue' ? 'red' : 'amber'}>{d.derived === 'overdue' ? `${d.daysOverdue}d late` : `due ${fmtRelative(d.payment_due_date)}`}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Renewals in the next 60 days" actions={<Link href="/calendar" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary no-underline hover:underline">Calendar <ArrowRight size={11} /></Link>}>
              {data.renewals.length === 0 && <Empty compact>No policies ending in the next 60 days.</Empty>}
              <ul className="m-0 p-0 list-none flex flex-col">
                {data.renewals.slice(0, 8).map(r => (
                  <li key={r.policyId} className="border-b border-[--border-subtle] last:border-b-0">
                    <Link href={r.companyId ? `/companies/${r.companyId}?tab=purchases` : '/calendar'} className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] truncate">{r.companyName ?? 'Unknown company'} · {r.classOfInsurance ?? 'Policy'}</span>
                        <span className="block text-[11.5px] text-muted-foreground truncate">{r.insurer ?? ''}{r.policyNumber ? ` · ${r.policyNumber}` : ''}</span>
                      </span>
                      <span className="text-[11.5px] text-muted-foreground whitespace-nowrap hidden sm:block">{fmtDate(r.endDate)}</span>
                      <Chip tone="amber">{fmtRelative(r.endDate)}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Most active companies" actions={<Link href="/companies" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary no-underline hover:underline">All companies <ArrowRight size={11} /></Link>}>
              {data.companies.length === 0 && <Empty compact>No companies yet.</Empty>}
              <ul className="m-0 p-0 list-none flex flex-col">
                {data.companies.map(c => (
                  <li key={c.id} className="border-b border-[--border-subtle] last:border-b-0">
                    <Link href={`/companies/${c.id}`} className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary">
                      <span className="text-[13px] font-medium min-w-0 flex-1 truncate">{c.name}</span>
                      <StageBadge stage={c.stage} />
                      {c.needsReply > 0 && <Chip tone="amber">{c.needsReply}</Chip>}
                      {c.overdueCount > 0 && <Chip tone="red">{c.overdueCount} overdue</Chip>}
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:block">{fmtRelative(c.lastActivityAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  )
}
