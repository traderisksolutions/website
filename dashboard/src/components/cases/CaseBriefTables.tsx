'use client'

/**
 * The two tables of the Brief tab: the brief in five parts, and the documents the case's line of
 * insurance needs. Code fills both from the case's emails and notes; a person confirms a document,
 * marks it not needed, or turns a finding down.
 */
import Link from 'next/link'
import { Btn, Chip, Empty } from '@/components/crm/primitives'
import { selectCls } from '@/components/today/MailView'
import { DASH, fmtDay } from '@/lib/format'
import { actorName, senderName, type Staff } from '@/lib/cases/names'
import type { BriefRow } from '@/lib/cases/brief'
import { ITEM_STATE_NAME, type ItemState } from '@/lib/cases/checklist'
import type { CaseBriefView, CheckAction, CheckRow } from '@/lib/cases/brief-store'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { headingCls, subjectBtn, tableFrame } from './shared'

const muted = <span className="text-trs-muted">{DASH}</span>
const STATE_TONE: Record<ItemState, 'neutral' | 'blue' | 'amber' | 'green'> = { missing: 'amber', found: 'blue', confirmed: 'green', not_needed: 'neutral' }

export function BriefTable({ view, staff, onOpenThread }: { view: Pick<CaseBriefView, 'brief' | 'parts'>; staff: readonly Staff[]; onOpenThread: (threadId: string) => void }) {
  const { brief, parts } = view
  /** The email a row rests on; a person's own note names the person. */
  const source = (r: BriefRow) => {
    if (r.private) return <span className="text-trs-muted">Colleague’s mailbox · words withheld</span>
    if (!r.source) return r.author ? <span className="text-trs-muted">{actorName(r.author, staff)}</span> : muted
    const line = [r.source.from ? senderName(r.source.from) : null, r.source.quote ? `“${r.source.quote}”` : null].filter(Boolean).join(' · ') || 'Open the email'
    return <button type="button" onClick={() => onOpenThread(r.source!.thread_id)} className={`${subjectBtn} whitespace-normal`} title="Open the email thread">{line}</button>
  }
  return (
    <div className={tableFrame}>
      <table className="trs-table table-fixed" style={{ minWidth: 860 }} aria-label="Brief">
        <colgroup><col style={{ width: 168 }} /><col /><col style={{ width: 170 }} /><col style={{ width: 108 }} /><col style={{ width: '26%' }} /></colgroup>
        <thead><tr><th>Part</th><th>Item</th><th>Who</th><th>Date</th><th>Source</th></tr></thead>
        <tbody>
          {parts.flatMap(({ part, name }) => {
            const rows = brief.rows.filter(r => r.part === part)
            if (!rows.length) return [(
              <tr key={part} className="align-top">
                <td className="cell-left px-3 py-2 text-[13px] font-medium text-trs-ink">{name}</td>
                <td className="cell-left px-3 py-2 text-[13px] text-trs-muted" colSpan={4}>None on record</td>
              </tr>
            )]
            return rows.map((r, i) => (
              <tr key={`${part}-${i}`} className="align-top">
                <td className="cell-left px-3 py-2 text-[13px] font-medium text-trs-ink">{i === 0 ? name : <span className="sr-only">{name}</span>}</td>
                <td className="cell-left px-3 py-2 text-[13px] leading-[1.5] break-words whitespace-pre-line">
                  {r.kind && <Chip tone={r.kind === 'Risk' ? 'amber' : 'green'} className="mr-1.5 align-middle">{r.kind}</Chip>}
                  {r.private && !r.text ? <span className="text-trs-muted">Words withheld</span> : r.text}
                </td>
                <td className="cell-left px-3 py-2 text-[13px] [overflow-wrap:anywhere]">{r.who ?? muted}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.date ? fmtDay(r.date) : muted}</td>
                <td className="cell-left px-3 py-2 text-[13px] leading-[1.5] break-words">{source(r)}</td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CaseDocuments({ view, staff, busy, onOpenThread, onCheck, onLine }: {
  view: CaseBriefView
  staff: readonly Staff[]
  /** The item a call is being saved for, or 'line'. */
  busy: string | null
  onOpenThread: (threadId: string) => void
  onCheck: (row: CheckRow, action: CheckAction) => void
  onLine: (line: string | null) => void
}) {
  const { line, checklist } = view
  const file = (r: CheckRow) => {
    if (r.private) return <span className="text-trs-muted">Colleague’s mailbox · file name withheld</span>
    if (!r.file) return r.found_by === 'wish' && r.state !== 'missing' && r.state !== 'not_needed' ? <span className="text-trs-muted">On the brief</span> : muted
    const f = r.file
    return (
      <button type="button" onClick={() => onOpenThread(f.thread_id)} className={`${subjectBtn} whitespace-normal [overflow-wrap:anywhere]`} title="Open the email thread">
        {[f.filename, f.from ? senderName(f.from) : null, f.at ? fmtDay(f.at) : null].filter(Boolean).join(' · ')}
      </button>
    )
  }
  const act = (r: CheckRow, action: CheckAction, label: string) => <Btn key={action} size="xs" disabled={busy !== null} loading={busy === `${r.item_id}:${action}`} onClick={() => onCheck(r, action)}>{label}</Btn>
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <h2 className={`${headingCls} flex flex-wrap items-center gap-2`}>
          {checklist ? `Documents · ${checklist.name} · ${checklist.ticked} of ${checklist.total}` : line ? `Documents · ${line.name}` : 'Documents'}
          {checklist && !checklist.confirmed_by && <Chip tone="amber">Draft list</Chip>}
        </h2>
        <select className={selectCls} aria-label="Line of insurance" value={line?.line ?? ''} disabled={busy !== null} onChange={e => onLine(e.target.value || null)}>
          {!line && <option value="">Choose a line</option>}
          {line?.by === 'person' && <option value="">Clear my choice</option>}
          {PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
        </select>
      </div>
      {!line ? <Empty compact>No line of insurance on this case.</Empty>
        : !checklist ? <Empty compact>No document checklist for {line.name}. <Link href="/settings?section=checklists" className="text-trs-ink underline">Settings › Document checklists</Link></Empty>
        : checklist.rows.length === 0 ? <Empty compact>The {checklist.name} list holds no document.</Empty> : (
          <div className={tableFrame}>
            <table className="trs-table table-fixed" style={{ minWidth: 860 }} aria-label="Documents">
              <colgroup><col style={{ width: '24%' }} /><col style={{ width: 118 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 252 }} /></colgroup>
              <thead><tr><th>Document</th><th>Status</th><th>File</th><th>By</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {checklist.rows.map(r => (
                  <tr key={r.item_id} className="align-top">
                    <td className="cell-left px-3 py-2 text-[13px] text-trs-ink break-words">{r.label}</td>
                    <td className="cell-left px-3 py-2"><Chip tone={STATE_TONE[r.state]}>{ITEM_STATE_NAME[r.state]}</Chip></td>
                    <td className="cell-left px-3 py-2 text-[13px] leading-[1.5]">{file(r)}</td>
                    <td className="cell-left px-3 py-2 text-[13px] [overflow-wrap:anywhere]">{r.actor ? `${actorName(r.actor, staff)}${r.at ? ` · ${fmtDay(r.at)}` : ''}` : muted}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {r.state === 'confirmed' || r.state === 'not_needed' ? act(r, 'clear', 'Undo') : [
                          act(r, 'confirm', 'Confirm'),
                          r.state === 'found' && r.file ? act(r, 'reject', 'Not this file') : null,
                          act(r, 'not_needed', 'Not needed'),
                        ]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
