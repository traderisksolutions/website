'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffMember } from '@/lib/crm/staff'
import type { Row } from '@/components/board/useBoardData'
import { relative } from '@/components/board/model'
import { PersonTag } from '@/components/board/TodoEditor'
import { STAGE_LABEL } from '@/lib/crm/types'
import { daysBetweenIso } from '@/lib/crm/renewal'
import { badgesFor, type BadgeKey, type BadgeTone } from './badges'

/**
 * The Companies table in Home's design system: white, hairlines, sentence-case headers that
 * sort, tabular numbers on the right, the Company column frozen. States are words.
 */

export type SortKey = 'name' | 'stage' | 'threads' | 'ltv' | 'renewal' | 'owner'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[#f1f3f4] text-[#3c4043]', blue: 'bg-[#EAF2FF] text-[#1a3c8a]', green: 'bg-[#EAF6EC] text-[#1e5b30]',
  amber: 'bg-[#FFF6D8] text-[#6b4d00]', orange: 'bg-[#FFF0E7] text-[#7a3d10]', red: 'bg-[#f1f3f4] text-[#3c4043]',
}
export function Tag({ tone, children, title, onClick, className }: { tone: BadgeTone; children: React.ReactNode; title?: string; onClick?: () => void; className?: string }) {
  const cls = cn('inline-flex items-center gap-1 px-2 h-[22px] text-[12px] font-medium whitespace-nowrap leading-none', TONE[tone], onClick && 'cursor-pointer', className)
  return onClick ? <button type="button" onClick={e => { e.stopPropagation(); onClick() }} title={title} className={cn(cls, 'border-0')}>{children}</button> : <span title={title} className={cls}>{children}</span>
}
export function StageTag({ stage }: { stage: string }) {
  return <span className="text-[13.5px]" style={{ color: '#3c4043' }}>{STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}</span>
}
export function RenewalCell({ date, today, compact, align = 'left' }: { date: string | null; today: string; compact?: boolean; align?: 'left' | 'right' }) {
  if (!date) return <span className="text-[13px]" style={{ color: '#9aa0a6' }}>No renewal date</span>
  const d = daysBetweenIso(today, date)
  const [y, m, dd] = date.slice(0, 10).split('-').map(Number)
  const nice = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 ? `in ${d} days` : d === -1 ? 'ended yesterday' : `ended ${-d} days ago`
  return (
    <span className={cn('inline-flex', compact ? 'items-baseline gap-2' : 'flex-col gap-0.5', align === 'right' && 'items-end text-right')}>
      <span className="text-[14px] tabular-nums" style={{ color: INK }}>{nice}</span>
      <span className="text-[12.5px]" style={{ color: MUTED }}>{when}</span>
    </span>
  )
}
export function BadgeList({ r, today, onFilter, max = 3 }: { r: Row; today: string; onFilter?: (k: BadgeKey) => void; max?: number }) {
  const all = badgesFor(r, today)
  if (all.length === 0) return <span className="text-[12px]" style={{ color: '#9aa0a6' }}>—</span>
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

function SortHeader({ col, sort, onSort, className }: { col: typeof COLUMNS[number]; sort: Sort; onSort: (k: SortKey) => void; className?: string }) {
  const on = sort.key === col.key
  const Icon = on ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('py-0 font-normal', col.align === 'right' ? 'text-right' : 'text-left', className)}>
      <button type="button" onClick={() => onSort(col.key)} title={col.hint}
        className={cn('group inline-flex items-center gap-1.5 h-11 bg-transparent border-0 cursor-pointer text-[13px] whitespace-nowrap', col.align === 'right' && 'flex-row-reverse', on ? 'font-medium' : '')} style={{ color: on ? INK : MUTED }}>
        {col.label}
        <Icon size={13} className={cn(on ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} aria-hidden />
      </button>
    </th>
  )
}

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
    return <>{text.slice(0, i)}<mark style={{ background: 'transparent', color: 'inherit', textDecoration: 'underline', textDecorationColor: '#9aa0a6', textUnderlineOffset: 3 }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
  }
  return (
    <>
      <div className="hidden md:block rounded-[16px] overflow-hidden bg-white" style={{ border: `1px solid ${RULE}` }}>
        <div className="overflow-auto max-h-[calc(100vh-260px)]">
          <table className="w-full border-collapse min-w-[960px]" aria-label="Client companies">
            <thead className="sticky top-0 z-20 bg-white">
              <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                {COLUMNS.map((col, i) => (
                  <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} className={cn(i === 0 ? 'sticky left-0 z-30 bg-white pl-6 pr-4 min-w-[280px] shadow-[inset_-1px_0_0_#e8eaed]' : 'px-4', i === COLUMNS.length - 1 && 'pr-6')} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const c = r.company
                const on = selectedId === c.id
                const ltv = ltvOf(r)
                const owners = c.owner_emails
                return (
                  <tr key={c.id} tabIndex={0} aria-selected={on} data-company={c.id} onClick={() => onSelect(c.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id) } }}
                    className={cn('group cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124]', on ? 'bg-[#eef3fc]' : 'hover:bg-[#f8f9fa]')} style={{ borderBottom: `1px solid ${RULE}` }}>
                    <td className={cn('sticky left-0 z-10 pl-6 pr-4 py-4 align-middle min-w-[280px] max-w-[340px] shadow-[inset_-1px_0_0_#e8eaed]', on ? 'bg-[#eef3fc]' : 'bg-white group-hover:bg-[#f8f9fa]')}>
                      {on && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: INK }} aria-hidden />}
                      <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }} title={c.name}>{mark(c.name)}</span>
                      <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{c.domains[0] ? mark(c.domains[0]) : c.industry ?? 'No domain on file'}</span>
                    </td>
                    <td className="px-4 py-4 align-middle"><StageTag stage={c.stage} /></td>
                    <td className="px-4 py-4 align-middle text-right whitespace-nowrap">
                      <span className="block text-[14px] tabular-nums" style={{ color: INK }}>{c.openThreads}</span>
                      <span className="block text-[12.5px]" style={{ color: MUTED }}>{c.needsReply > 0 ? `${c.needsReply} awaiting reply` : c.openThreads === 0 ? 'No open threads' : 'None waiting on us'}</span>
                    </td>
                    <td className="px-4 py-4 align-middle text-right whitespace-nowrap">
                      {ltv ? <><span className="block text-[14px] tabular-nums" style={{ color: INK }}>{money(ltv.total, ltv.currency)}</span><span className="block text-[12.5px]" style={{ color: MUTED }}>{ltv.notes} debit note{ltv.notes === 1 ? '' : 's'}</span></> : <span style={{ color: '#9aa0a6' }}>—</span>}
                    </td>
                    <td className="px-4 py-4 align-middle text-right whitespace-nowrap"><RenewalCell date={c.nextRenewalDate} today={today} align="right" /></td>
                    <td className="px-4 pr-6 py-4 align-middle whitespace-nowrap">
                      <span className="flex items-center gap-2.5">
                        {owners.length ? owners.map(o => <PersonTag key={o} email={o} staff={staff} size="md" />) : <span className="text-[13.5px]" style={{ color: MUTED }}>No owner</span>}
                        <span className="text-[12.5px]" style={{ color: MUTED }}>{c.lastActivityAt ? `Last activity ${relative(c.lastActivityAt)}` : 'No activity yet'}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="md:hidden m-0 p-0 list-none rounded-[16px] bg-white overflow-hidden" style={{ border: `1px solid ${RULE}` }}>
        {rows.map(r => {
          const c = r.company
          const ltv = ltvOf(r)
          return (
            <li key={c.id} style={{ borderBottom: `1px solid ${RULE}` }} className="last:border-b-0">
              <button type="button" onClick={() => onSelect(c.id)} className={cn('w-full text-left px-4 py-4 bg-transparent border-0 cursor-pointer', selectedId === c.id && 'bg-[#eef3fc]')}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block text-[15px] font-medium truncate" style={{ color: INK }}>{c.name}</span><span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{c.domains[0] ?? '—'}</span></span>
                  <StageTag stage={c.stage} />
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]" style={{ color: MUTED }}>
                  <span>{c.openThreads} thread{c.openThreads === 1 ? '' : 's'}{c.needsReply > 0 ? ` · ${c.needsReply} awaiting reply` : ''}</span>
                  <span className="text-right tabular-nums">{ltv ? money(ltv.total, ltv.currency) : '—'}</span>
                  <span>{c.owner_email ? (staff.get(c.owner_email)?.name ?? c.owner_email.split('@')[0]) : 'No owner'} · {relative(c.lastActivityAt)}</span>
                  <span className="text-right"><RenewalCell date={c.nextRenewalDate} today={today} compact align="right" /></span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
