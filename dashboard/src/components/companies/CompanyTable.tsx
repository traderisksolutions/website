'use client'

import { cn } from '@/lib/utils'
import { Btn } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import type { StaffMember } from '@/lib/crm/staff'
import type { Row } from '@/components/board/useBoardData'
import { relative } from '@/components/board/model'
import { PersonTag } from '@/components/board/TodoEditor'
import { STAGE_LABEL } from '@/lib/crm/types'
import { daysBetweenIso } from '@/lib/crm/renewal'
import { badgesFor, type BadgeKey, type BadgeTone } from './badges'

/**
 * The Companies table in Home's design system: white, hairlines, sentence-case headers that
 * sort, tabular numbers on the right, the Company column frozen. States are words. Dense since
 * 28 Oct 2026 like every register: 32px header at 12px, 34px rows at 13px, one line per row;
 * the domain, the debit-note count and the full renewal wording live in title attrs.
 */

export type SortKey = 'name' | 'stage' | 'threads' | 'ltv' | 'renewal' | 'owner'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-trs-field text-trs-ink-2', blue: 'bg-trs-info-bg text-trs-info', green: 'bg-trs-pos-bg text-trs-pos',
  amber: 'bg-trs-warn-bg text-trs-warn', orange: 'bg-trs-warn-bg text-trs-warn', red: 'bg-trs-field text-trs-ink-2',
}
export function Tag({ tone, children, title, onClick, className }: { tone: BadgeTone; children: React.ReactNode; title?: string; onClick?: () => void; className?: string }) {
  const cls = cn('inline-flex items-center gap-1 px-2 h-6 text-small font-medium whitespace-nowrap leading-none', TONE[tone], onClick && 'cursor-pointer', className)
  return onClick ? <Btn level="tertiary" size="xs" onClick={e => { e.stopPropagation(); onClick() }} title={title} className={cn(cls, 'border-0')}>{children}</Btn> : <span title={title} className={cls}>{children}</span>
}
export function StageTag({ stage }: { stage: string }) {
  return <span className="text-body text-trs-ink-2">{STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}</span>
}
export function RenewalCell({ date, today, compact, align = 'left' }: { date: string | null; today: string; compact?: boolean; align?: 'left' | 'right' }) {
  if (!date) return <span className="text-body text-trs-subtle">No renewal date</span>
  const d = daysBetweenIso(today, date)
  const [y, m, dd] = date.slice(0, 10).split('-').map(Number)
  const nice = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? `in ${d} days` : d === -1 ? 'ended yesterday' : `ended ${-d} days ago`
  return (
    <span className={cn('inline-flex', compact ? 'items-baseline gap-2' : 'flex-col gap-0.5', align === 'right' && 'items-end text-right')}>
      <span className="text-body tabular-nums text-trs-ink">{nice}</span>
      <span className="text-small text-trs-muted">{when}</span>
    </span>
  )
}
export function BadgeList({ r, today, onFilter, max = 3 }: { r: Row; today: string; onFilter?: (k: BadgeKey) => void; max?: number }) {
  const all = badgesFor(r, today)
  if (all.length === 0) return <span className="text-small text-trs-subtle">—</span>
  const shown = all.slice(0, max), rest = all.slice(max)
  return <span className="inline-flex items-center gap-1 flex-wrap">{shown.map(b => <Tag key={b.key} tone={b.tone} title={b.title} onClick={onFilter ? () => onFilter(b.key) : undefined}>{b.label}</Tag>)}{rest.length > 0 && <Tag tone="neutral" title={rest.map(b => b.label).join(' · ')}>+{rest.length}</Tag>}</span>
}

export function ltvOf(r: Row): { currency: string; total: number; notes: number } | null {
  return r.company.ltv.find(l => l.currency === 'SGD') ?? r.company.ltv[0] ?? null
}
function money(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function compareRows(a: Row, b: Row, sort: Sort): number {
  const dir = sort.dir === 'asc' ? 1 : -1
  const last = (x: boolean, y: boolean) => (x === y ? 0 : x ? 1 : -1)
  switch (sort.key) {
    case 'name':    return dir * a.company.name.localeCompare(b.company.name)
    case 'stage':   return dir * a.company.stage.localeCompare(b.company.stage) || a.company.name.localeCompare(b.company.name)
    case 'threads': return dir * ((a.company.openThreads - b.company.openThreads) || (a.company.needsReply - b.company.needsReply)) || a.company.name.localeCompare(b.company.name)
    case 'ltv':     return dir * ((ltvOf(a)?.total ?? 0) - (ltvOf(b)?.total ?? 0)) || a.company.name.localeCompare(b.company.name)
    case 'renewal': { const ra = a.company.nextRenewalDate, rb = b.company.nextRenewalDate; return last(!ra, !rb) || dir * (ra! < rb! ? -1 : ra! > rb! ? 1 : 0) || a.company.name.localeCompare(b.company.name) }
    case 'owner':   { const oa = a.company.owner_emails[0] ?? null, ob = b.company.owner_emails[0] ?? null; return last(!oa, !ob) || dir * (oa ?? '').localeCompare(ob ?? '') || (b.company.lastActivityAt ?? '').localeCompare(a.company.lastActivityAt ?? '') }
  }
}

export const SORT_LABEL: Record<SortKey, string> = { name: 'name', stage: 'stage', threads: 'threads', ltv: 'LTV', renewal: 'next policy renewal', owner: 'owner' }

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; hint: string }[] = [
  { key: 'name',    label: 'Company',               align: 'left',  hint: 'Company name' },
  { key: 'stage',   label: 'Stage',                 align: 'left',  hint: 'Relationship stage' },
  { key: 'threads', label: 'Threads',               align: 'right', hint: 'Open email threads, and how many wait on our reply' },
  { key: 'ltv',     label: 'LTV',                   align: 'right', hint: 'Lifetime value: gross premium billed across every debit note' },
  { key: 'renewal', label: 'Next policy renewal',   align: 'right', hint: 'Earliest end date among active policies' },
  { key: 'owner',   label: 'Owner and last activity', align: 'left', hint: 'Account owner, and when the last email moved' },
]

export function CompanyTable({ rows, today, staff, workloads, selectedId, onSelect, sort, onSort, highlight }: {
  rows: Row[]; today: string; staff: Map<string, StaffMember>; workloads: Map<string, { open: number; overdue: number }>
  selectedId: string | null; onSelect: (id: string) => void; sort: Sort; onSort: (k: SortKey) => void; highlight?: string
}) {
  void workloads
  const mark = (text: string) => {
    const q = highlight?.trim().toLowerCase()
    if (!q) return text
    const i = text.toLowerCase().indexOf(q)
    if (i < 0) return text
    return <>{text.slice(0, i)}<mark className="bg-transparent text-inherit underline decoration-trs-subtle underline-offset-[3px]">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
  }
  return (
    <>
      <Register label="Client companies" minWidth={960} maxHeight="calc(100vh - 260px)" className="hidden md:block">
        <RegisterHead>
          {COLUMNS.map((col, i) => (
            <RegisterTh key={col.key} first={i === 0} last={i === COLUMNS.length - 1} active={sort.key === col.key} dir={sort.dir} onSort={() => onSort(col.key)} hint={col.hint}>{col.label}</RegisterTh>
          ))}
        </RegisterHead>
        <tbody>
          {rows.map(r => {
            const c = r.company
            const on = selectedId === c.id
            const ltv = ltvOf(r)
            const owners = c.owner_emails
            return (
              <RegisterRow key={c.id} selected={on} onClick={() => onSelect(c.id)}>
                <RegisterCell first selected={on} identityWidth={260}>
                  <span className="block text-body font-medium leading-tight truncate text-trs-ink" title={c.domains[0] ? `${c.name} · ${c.domains[0]}` : c.name}>{mark(c.name)}</span>
                </RegisterCell>
                <RegisterCell><StageTag stage={c.stage} /></RegisterCell>
                <RegisterCell title={c.needsReply > 0 ? `${c.needsReply} awaiting our reply` : c.openThreads === 0 ? 'No open threads' : 'None waiting on us'}>
                  <span className="text-body tabular-nums text-trs-ink">{c.openThreads}</span>
                  {c.needsReply > 0 && <span className="text-small ml-1.5 text-trs-muted">{c.needsReply} awaiting</span>}
                </RegisterCell>
                <RegisterCell title={ltv ? `${ltv.notes} debit note${ltv.notes === 1 ? '' : 's'}` : undefined}>
                  {ltv ? <span className="text-body tabular-nums text-trs-ink">{money(ltv.total, ltv.currency)}</span> : <span className="text-trs-subtle">—</span>}
                </RegisterCell>
                <RegisterCell><RenewalCell date={c.nextRenewalDate} today={today} compact /></RegisterCell>
                <RegisterCell align="left" last>
                  <span className="flex items-center gap-2.5">
                    {owners.length ? owners.map(o => <PersonTag key={o} email={o} staff={staff} size="sm" />) : <span className="text-body text-trs-muted">No owner</span>}
                    <span className="text-small text-trs-muted">{c.lastActivityAt ? `Last activity ${relative(c.lastActivityAt)}` : 'No activity yet'}</span>
                  </span>
                </RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>

      <ul className="md:hidden m-0 p-0 list-none rounded bg-white overflow-hidden border border-trs-line">
        {rows.map(r => {
          const c = r.company
          const ltv = ltvOf(r)
          return (
            <li key={c.id} className="border-b border-trs-line last:border-b-0">
              <Btn level="tertiary" onClick={() => onSelect(c.id)} className={cn('block h-auto w-full text-left px-4 py-4 border-0 rounded-none font-normal whitespace-normal text-trs-ink', selectedId === c.id && 'bg-trs-soft')}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block text-body font-medium truncate text-trs-ink">{c.name}</span><span className="block text-small truncate text-trs-muted">{c.domains[0] ?? '—'}</span></span>
                  <StageTag stage={c.stage} />
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-small text-trs-muted">
                  <span>{c.openThreads} thread{c.openThreads === 1 ? '' : 's'}{c.needsReply > 0 ? ` · ${c.needsReply} awaiting reply` : ''}</span>
                  <span className="text-right tabular-nums">{ltv ? money(ltv.total, ltv.currency) : '—'}</span>
                  <span>{c.owner_email ? (staff.get(c.owner_email)?.name ?? c.owner_email.split('@')[0]) : 'No owner'} · {relative(c.lastActivityAt)}</span>
                  <span className="text-right"><RenewalCell date={c.nextRenewalDate} today={today} compact align="right" /></span>
                </span>
              </Btn>
            </li>
          )
        })}
      </ul>
    </>
  )
}
