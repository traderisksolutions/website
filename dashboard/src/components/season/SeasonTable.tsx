'use client'

/**
 * The Renewal Season list: one row per policy ending in the window (and per renewal case no policy
 * takes), with where its case stands and one action. Start opens the renewal case for a policy
 * without one; Select conversations opens the client's threads to tick; the Wish list count opens
 * the list to type into; Open goes to the case's Brief.
 */
import Link from 'next/link'
import { Btn, Empty, LinkBtn } from '@/components/crm/primitives'
import { tableFrame } from '@/components/cases/shared'
import { DASH, fmtDate } from '@/lib/format'
import { STAGE_LABEL, isStage } from '@/lib/cases/stage'
import type { SeasonCompare, SeasonRow } from '@/lib/cases/season'

const COMPARE_NAME: Record<SeasonCompare['kind'], string> = { proposal: 'Proposal', new_quotation: 'New quotation', comparison: 'Comparison' }
const link = 'text-trs-ink no-underline hover:underline'
const none = <span className="text-trs-muted">{DASH}</span>

export function SeasonTable({ rows, starting, onStart, onPick, onWishes }: {
  rows: SeasonRow[]
  /** The row whose case is being started. */
  starting: string | null
  onStart: (row: SeasonRow) => void
  onPick: (row: SeasonRow) => void
  onWishes: (row: SeasonRow) => void
}) {
  if (!rows.length) return <Empty>No renewals in this view.</Empty>
  return (
    <div className={tableFrame}>
      <table className="trs-table table-fixed min-w-[1200px]" aria-label="Renewal Season">
        <colgroup><col className="w-[15%]" /><col /><col className="w-[108px]" /><col className="w-[124px]" /><col className="w-[108px]" /><col className="w-[72px]" /><col className="w-[92px]" /><col className="w-[112px]" /><col className="w-[180px]" /></colgroup>
        <thead><tr><th>Client</th><th>Policy</th><th>Ends</th><th>Stage</th><th>Conversations</th><th>Wish list</th><th>Documents</th><th>Compare</th><th><span className="sr-only">Action</span></th></tr></thead>
        <tbody>
          {rows.map(r => {
            const c = r.case
            const brief = c ? `/today/${c.id}?section=brief` : null
            const detail = r.policy ? [r.policy.insurer, r.policy.number].filter(Boolean).join(' · ') : r.line_name
            return (
              <tr key={r.key}>
                <td className="cell-left px-3">{r.company_id ? <Link href={`/companies/${r.company_id}`} className={`block truncate ${link}`} title={r.company}>{r.company}</Link> : <span className="block truncate" title={r.company}>{r.company}</span>}</td>
                <td className="cell-left px-3">
                  {r.policy
                    ? <Link href={`/policies/${r.policy.id}`} className={`block truncate ${link}`} title={r.policy.name}>{r.policy.name}</Link>
                    : <Link href={`/today/${c!.id}`} className={`block truncate ${link}`} title={c!.title ?? undefined}>{c!.title ?? 'Renewal case'}</Link>}
                  {detail && <span className="block truncate text-small text-trs-muted" title={detail}>{detail}</span>}
                </td>
                <td className="px-3 whitespace-nowrap tabular-nums">
                  {r.end_date ? <>{fmtDate(r.end_date)}<span className={`block text-small ${r.days! < 0 ? 'text-trs-neg' : 'text-trs-muted'}`}>{r.days! < 0 ? `${-r.days!} days ago` : r.days === 0 ? 'today' : `in ${r.days} days`}</span></> : none}
                </td>
                <td className="px-3">{c ? (isStage(c.stage) ? STAGE_LABEL[c.stage] : none) : <span className="text-trs-muted">No case</span>}</td>
                <td className="px-3 tabular-nums">
                  {c && r.company_id ? <Btn level="tertiary" size="xs" className="tabular-nums" aria-label={`Select conversations for ${r.company}, ${c.threads} on the case`} onClick={() => onPick(r)}>{c.threads}</Btn> : c ? c.threads : none}
                </td>
                <td className="px-3 tabular-nums">{c ? <Btn level="tertiary" size="xs" className="tabular-nums" aria-label={`Wish list for ${r.company}, ${c.wishes} on the case`} onClick={() => onWishes(r)}>{c.wishes}</Btn> : none}</td>
                <td className="px-3 tabular-nums whitespace-nowrap">{c?.documents ? <Link href={brief!} className={link}>{c.documents.ticked} of {c.documents.required}</Link> : none}</td>
                <td className="px-3 whitespace-nowrap">{r.compare ? <Link href={r.compare.href} className={link}>{COMPARE_NAME[r.compare.kind]}{r.compare.kind === 'comparison' && c && c.options > 0 ? ` · ${c.options}` : ''}</Link> : none}</td>
                <td className="px-3">
                  {!c ? <Btn size="xs" loading={starting === r.key} disabled={starting !== null} onClick={() => onStart(r)}>Start</Btn>
                    : c.threads === 0 && r.company_id ? <Btn size="xs" onClick={() => onPick(r)}>Select conversations</Btn>
                    : <LinkBtn size="xs" href={brief!}>Open</LinkBtn>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
