'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Reply, Receipt, CalendarClock, ListChecks, Sparkles, Link2, Building2, Waypoints, Bot, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { SectionCard, Chip, Empty, Spinner, StageBadge } from '@/components/crm/primitives'
import { fmtMoney, fmtRelative, fmtDate } from '@/lib/crm/format'
import { ACTION_KIND_LABEL, STAGES, STAGE_LABEL, type CompanyAction, type CompanySummaryRow, type PaymentDerived } from '@/lib/crm/types'

type Home = {
  today: string
  kpis: { needsReply: number; overdueCount: number; overdueMoney: { currency: string; outstanding: number; overdue: number }[]; renewals60d: number; actionsDueWeek: number; proposedActions: number; unlinkedThreads: number; pendingDrafts: number; companies: number; byStage: Record<string, number> }
  needsReply: { threadId: string; subject: string | null; category: string | null; companyId: string | null; companyName: string | null; from: string; at: string }[]
  overdue: (PaymentDerived & { companyName: string | null })[]
  dueSoon: (PaymentDerived & { companyName: string | null })[]
  renewals: { policyId: string; policyNumber: string | null; insurer: string | null; classOfInsurance: string | null; endDate: string; companyId: string | null; companyName: string | null }[]
  actionsDue: (CompanyAction & { companyName: string | null })[]
  proposed: (CompanyAction & { companyName: string | null })[]
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

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom))] bg-background">
      <div className="max-w-[1240px] mx-auto px-6 py-6">
        <PageHeader
          title="Today"
          description={data ? `${fmtDate(data.today)} · ${k!.companies} client compan${k!.companies === 1 ? 'y' : 'ies'} · ${STAGES.filter(s => (k!.byStage[s] ?? 0) > 0).map(s => `${k!.byStage[s]} ${STAGE_LABEL[s].toLowerCase()}`).join(', ')}` : 'What needs attention across every client.'}
          className="mb-5"
          actions={
            <div className="flex items-center gap-1.5 flex-wrap">
              <Quick href="/companies" icon={Building2} label="Companies" />
              <Quick href="/pipeline" icon={Waypoints} label="Pipeline" />
              <Quick href="/engagement" icon={Bot} label="Inbox" />
            </div>
          }
        />

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Awaiting reply" value={k?.needsReply ?? 0} sublabel="Client emails unanswered" href="/engagement" loading={!data} accent={k && k.needsReply > 0 ? 'amber' : undefined} icon={Reply} />
          <StatCard label="Overdue" value={k?.overdueCount ?? 0} sublabel={sgdOverdue > 0 ? fmtMoney(sgdOverdue, 'SGD', { compact: true }) : 'Debit notes past due'} href="/debit-notes" loading={!data} accent={k && k.overdueCount > 0 ? 'red' : undefined} icon={Receipt} />
          <StatCard label="Renewals" value={k?.renewals60d ?? 0} sublabel="Ending in 60 days" href="/calendar" loading={!data} icon={CalendarClock} />
          <StatCard label="Actions due" value={k?.actionsDueWeek ?? 0} sublabel="This week" loading={!data} accent={k && k.actionsDueWeek > 0 ? 'blue' : undefined} icon={ListChecks} />
          <StatCard label="To review" value={k?.proposedActions ?? 0} sublabel="Proposed by the agent" loading={!data} icon={Sparkles} />
          <StatCard label="Threads to link" value={k?.unlinkedThreads ?? 0} sublabel="No company yet" href="/companies/triage" loading={!data} accent={k && k.unlinkedThreads > 0 ? 'amber' : undefined} icon={Link2} />
        </div>

        {!data && !error && <Spinner label="Gathering today’s work…" />}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <SectionCard title="Needs a reply" description="Latest message is from the client and nobody has answered." padded={false}>
              {data.needsReply.length === 0 && <Empty compact>Inbox is clear.</Empty>}
              <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
                {data.needsReply.slice(0, 10).map(t => (
                  <li key={t.threadId}>
                    <Link href={`/engagement?lead=${t.threadId}`} className="flex items-center gap-3 px-4 py-2.5 no-underline text-foreground hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium m-0 truncate">{t.subject ?? '(no subject)'}</p>
                        <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">{t.companyName ?? 'No company'} · {t.from}</p>
                      </div>
                      {t.category && <Chip tone="neutral" className="capitalize hidden sm:inline-flex">{t.category}</Chip>}
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtRelative(t.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Money" description="Overdue first, then due in the next 14 days." padded={false}>
              {data.overdue.length === 0 && data.dueSoon.length === 0 && <Empty compact>Nothing overdue or due soon.</Empty>}
              <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
                {[...data.overdue, ...data.dueSoon].slice(0, 10).map(d => (
                  <li key={d.id}>
                    <Link href={`/companies/${d.company_id}?tab=payments`} className="flex items-center gap-3 px-4 py-2.5 no-underline text-foreground hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium m-0 truncate">{d.companyName ?? 'Unknown company'} · <span className="font-mono text-[11.5px]">{d.debit_note_no}</span></p>
                        <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">{d.classOfInsurance ?? d.event_type ?? ''}{d.insurer ? ` · ${d.insurer}` : ''}</p>
                      </div>
                      <span className="text-[12.5px] font-semibold tabular-nums whitespace-nowrap">{fmtMoney(d.outstanding, d.currency)}</span>
                      <Chip tone={d.derived === 'overdue' ? 'red' : 'amber'}>{d.derived === 'overdue' ? `${d.daysOverdue}d late` : `due ${fmtRelative(d.payment_due_date)}`}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Actions" description="Due this week, and proposals from the agent waiting for a decision." padded={false}>
              {data.actionsDue.length === 0 && data.proposed.length === 0 && <Empty compact>No actions due. Open a company and ask the agent to find next actions.</Empty>}
              <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
                {[...data.actionsDue, ...data.proposed].slice(0, 10).map(a => (
                  <li key={a.id}>
                    <Link href={`/companies/${a.company_id}?tab=actions`} className="flex items-center gap-3 px-4 py-2.5 no-underline text-foreground hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium m-0 truncate">{a.title}</p>
                        <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">{a.companyName ?? ''} · {ACTION_KIND_LABEL[a.kind]}{a.owner_email ? ` · ${a.owner_email.split('@')[0]}` : ''}</p>
                      </div>
                      {a.status === 'proposed' ? <Chip tone="blue"><Sparkles size={10} /> Review</Chip> : a.due_date ? <Chip tone={a.due_date < data.today ? 'red' : 'neutral'}>{a.due_date < data.today ? 'Overdue' : fmtRelative(a.due_date)}</Chip> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Renewals in the next 60 days" padded={false}>
              {data.renewals.length === 0 && <Empty compact>No policies ending in the next 60 days.</Empty>}
              <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
                {data.renewals.slice(0, 10).map(r => (
                  <li key={r.policyId}>
                    <Link href={r.companyId ? `/companies/${r.companyId}?tab=policies` : '/calendar'} className="flex items-center gap-3 px-4 py-2.5 no-underline text-foreground hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium m-0 truncate">{r.companyName ?? 'Unknown company'} · {r.classOfInsurance ?? 'Policy'}</p>
                        <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">{r.insurer ?? ''}{r.policyNumber ? ` · ${r.policyNumber}` : ''}</p>
                      </div>
                      <span className="text-[11.5px] text-muted-foreground whitespace-nowrap">{fmtDate(r.endDate)}</span>
                      <Chip tone="amber">{fmtRelative(r.endDate)}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Most active companies" padded={false} className="lg:col-span-2" actions={<Link href="/companies" className="text-[12px] font-semibold text-primary no-underline hover:underline inline-flex items-center gap-1">All companies <ArrowRight size={12} /></Link>}>
              {data.companies.length === 0 && <Empty compact>No companies yet.</Empty>}
              <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 divide-[--border-subtle]">
                {data.companies.map(c => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.id}`} className="flex flex-col gap-1 px-4 py-3 no-underline text-foreground hover:bg-muted/40 h-full">
                      <p className="text-[12.5px] font-semibold m-0 truncate">{c.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap"><StageBadge stage={c.stage} />{c.needsReply > 0 && <Chip tone="amber">{c.needsReply} awaiting reply</Chip>}{c.overdueCount > 0 && <Chip tone="red">{c.overdueCount} overdue</Chip>}</div>
                      <p className="text-[11px] text-muted-foreground m-0">{fmtRelative(c.lastActivityAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  )
}

function Quick({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold border border-input no-underline text-foreground hover:bg-muted"><Icon size={13} /> {label}</Link>
}
