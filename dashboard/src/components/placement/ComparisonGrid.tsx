'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { XlGrid, XlHead, XlHeadRow, XlTh, XlRow, XlCell, XL_BTN, type XlFill } from '@/components/ui/xl-grid'
import { fmtDate } from '@/lib/crm/format'
import { CELL_WORD, lineGrid, lowestByOption, type CellState, type GridCell, type GridInsurer } from '@/lib/placement/grid'
import type { LinePosition, PlacementQuote } from '@/lib/placement/types'
import type { PolicyView } from '@/components/policies/types'
import { callApi, errText, INK, MUTED, ERROR } from './shared'

const STATE_FILL: Partial<Record<CellState, XlFill>> = { quoted: 'good', declined: 'bad', chase: 'warn', expired: 'quiet', not_asked: 'quiet', drafted: 'info', withdrawn: 'quiet' }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const sgd = (n: number) => n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** A figure in the grid: S$ is assumed and left out; another currency keeps its code. */
function figure(amount: number | null | undefined, currency: string | null, text: string | null | undefined): string {
  if (amount != null) return `${currency && currency !== 'SGD' ? currency + ' ' : ''}${sgd(amount)}`
  const t = (text ?? '').trim()
  return t ? clip(t, 20) : ''
}

/** Rows that belong to the quote in each cell. */
const QUOTE_ROWS: { key: string; label: string; value: (q: PlacementQuote) => string; title?: (q: PlacementQuote) => string | undefined }[] = [
  { key: 'premium', label: 'Premium (S$)', value: q => figure(q.premium_amount, q.currency, q.premium_text) + (q.needs_review ? ' ·check' : ''), title: q => q.premium_text ?? undefined },
  { key: 'head', label: 'Per head (S$)', value: q => figure(q.premium_per_head_amount, q.currency, q.premium_per_head_text), title: q => q.premium_per_head_text ?? undefined },
  { key: 'limit', label: 'Limit', value: q => clip(q.limit_text ?? '', 18), title: q => q.limit_text ?? undefined },
  { key: 'excess', label: 'Excess', value: q => clip(q.excess_text ?? '', 18), title: q => q.excess_text ?? undefined },
  { key: 'terms', label: 'Key terms', value: q => q.key_terms.length ? clip(q.key_terms[0], 22) + (q.key_terms.length > 1 ? ` +${q.key_terms.length - 1}` : '') : '', title: q => q.key_terms.join('\n') || undefined },
  { key: 'valid', label: 'Valid until', value: q => q.valid_until ? fmtDate(q.valid_until) : clip(q.validity_text ?? '', 16) },
  { key: 'received', label: 'Received', value: q => fmtDate(q.created_at) },
]

/**
 * One line, priced side by side: every insurer asked across the top, each option the client
 * wants compared under every insurer, and the fields that matter down the side. Options are added
 * here at any time; asking for them drafts a follow-up to every insurer on the line for a person
 * to send.
 */
export function ComparisonGrid({ pos, policy, shared, leftOut, onToggleEmail, onChanged, onOpenDrafts }: {
  pos: LinePosition
  policy: PolicyView | null
  /** Quote id → when it last went to the client. */
  shared: Map<string, string>
  /** Quotes the broker unticked for the next comparison email. */
  leftOut: Set<string>
  onToggleEmail: (quoteId: string) => void
  onChanged: () => void
  onOpenDrafts: () => void
}) {
  const grid = useMemo(() => lineGrid(pos), [pos])
  const lowest = useMemo(() => lowestByOption(grid), [grid])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const proposed = pos.tiers.filter(t => t.status === 'proposed')
  const lineId = pos.line.id

  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(key); setError(null)
    try { await fn(); onChanged(); after?.() } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  const tiersApi = (body: Record<string, unknown>) => callApi(`/api/placements/lines/${lineId}/tiers`, { method: 'POST', body })
  const addOptions = () => {
    const labels = draft.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    if (labels.length === 0) return
    void run('add', () => tiersApi({ add: labels.map(label => ({ label })) }), () => setDraft(''))
  }
  const ask = () => run('ask', () => tiersApi({ ask: true }), onOpenDrafts)
  const drop = (tierId: string) => run(tierId, () => tiersApi({ drop: [tierId] }))
  // The client chose it: the confirmation to that insurer is drafted; sending it binds the policy.
  const pick = (quoteId: string) => run(quoteId, () => callApi<{ draftId: string | null }>(`/api/placements/quotes/${quoteId}/pick`, { method: 'POST' }), onOpenDrafts)
  const bound = pos.line.status === 'bound' || pos.line.status === 'done'

  const nOpt = grid.options.length
  const cols = 1 + grid.insurers.length * nOpt

  const perInsurer = (ins: GridInsurer, render: (ins: GridInsurer) => React.ReactNode, title?: string) => (
    <XlCell key={ins.key} colSpan={nOpt} title={title}>{render(ins)}</XlCell>
  )
  const perCell = (render: (c: GridCell, ins: GridInsurer) => React.ReactNode) =>
    grid.insurers.flatMap(ins => ins.cells.map(c => <XlCell key={`${ins.key}:${c.option.key}`}>{render(c, ins)}</XlCell>))

  const chosenId = policy?.chosen_quote_id ?? null

  return (
    <div className="flex flex-col gap-1.5">
      {/* Options toolbar: what the client wants compared, and asking the insurers for the new ones. */}
      <div className="flex items-center gap-1.5 flex-wrap text-[12px]" style={{ color: MUTED }}>
        <span>Options</span>
        {pos.tiers.length === 0 && <span>none yet · the line as asked</span>}
        {pos.tiers.map(t => (
          <span key={t.id} className="inline-flex items-center gap-1 h-5 pl-1.5 pr-0.5 rounded-[5px]" style={{ background: t.status === 'proposed' ? '#f1f3f4' : '#e8f0fe', color: INK }}
            title={`${t.status === 'proposed' ? 'Not asked yet' : t.status === 'offered' ? 'Offered by an insurer' : `Asked ${fmtDate(t.asked_at)}`} · from ${t.source}`}>
            {t.label}{t.status === 'proposed' && <span style={{ color: MUTED }}> · new</span>}
            <button type="button" aria-label={`Drop ${t.label}`} disabled={busy !== null} onClick={() => drop(t.id)}
              className="bg-transparent border-0 p-0.5 cursor-pointer rounded hover:bg-[#dadce0] leading-none" style={{ color: MUTED }}><X size={11} /></button>
          </span>
        ))}
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addOptions() }}
          placeholder="Add option: 1M, 2M, S$1,300/head" aria-label="Add options to compare"
          className="h-5 w-[210px] rounded-[5px] border border-[#dadce0] bg-white px-1.5 text-[12px] outline-none focus:border-[#202124]" style={{ color: INK }} />
        <Btn size="xs" level="tertiary" className={XL_BTN} disabled={busy !== null || !draft.trim()} loading={busy === 'add'} onClick={addOptions}>Add</Btn>
        {proposed.length > 0 && (
          <Btn size="xs" level="secondary" className={XL_BTN} disabled={busy !== null} loading={busy === 'ask'} onClick={ask}
            title="Drafts one email per insurer on this line; nothing is sent until you send it">
            Ask insurers for {proposed.length === 1 ? proposed[0].label : `${proposed.length} new options`}
          </Btn>
        )}
      </div>
      {error && <p className="m-0 text-[12px]" style={{ color: ERROR }}>{error}</p>}

      {grid.insurers.length === 0 ? (
        <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>No insurer asked yet.</p>
      ) : (
        <XlGrid label={`${pos.line.label ?? pos.line.product_line} comparison`} minWidth={Math.min(1400, 150 + cols * 96)}>
          <XlHead>
            <XlHeadRow>
              <XlTh sticky rowSpan={nOpt > 1 ? 2 : 1} align="left" width={128}>Field</XlTh>
              {grid.insurers.map(ins => (
                <XlTh key={ins.key} colSpan={nOpt} strong title={[ins.insurer, ins.product].filter(Boolean).join(' · ')}>
                  {ins.insurer}{ins.product && <span style={{ color: MUTED }}> · {clip(ins.product, 22)}</span>}
                </XlTh>
              ))}
            </XlHeadRow>
            {nOpt > 1 && (
              <XlHeadRow>
                {grid.insurers.flatMap(ins => grid.options.map(o => <XlTh key={`${ins.key}:${o.key}`} title={o.tier?.target_premium ?? undefined}>{clip(o.label, 16)}</XlTh>))}
              </XlHeadRow>
            )}
          </XlHead>
          <tbody>
            <XlRow>
              <XlCell label align="left" muted>Contact</XlCell>
              {grid.insurers.map(ins => perInsurer(ins, i => i.dispatch ? <span style={{ color: MUTED }}>{clip(i.dispatch.dispatch.to_email, 30)}</span> : <span style={{ color: MUTED }}>Rate table</span>, ins.dispatch?.dispatch.to_email))}
            </XlRow>
            <XlRow>
              <XlCell label align="left" muted>Status</XlCell>
              {grid.insurers.flatMap(ins => ins.cells.map(c => (
                <XlCell key={`${ins.key}:${c.option.key}`} fill={STATE_FILL[c.state] ?? null}
                  title={c.state === 'not_asked' ? 'Added after the request went out; ask the insurers to price it' : undefined}>
                  {CELL_WORD[c.state]}
                </XlCell>
              )))}
            </XlRow>
            {QUOTE_ROWS.map(r => (
              <XlRow key={r.key}>
                <XlCell label align="left" muted>{r.label}</XlCell>
                {grid.insurers.flatMap(ins => ins.cells.map(c => {
                  const q = c.quote
                  const best = r.key === 'premium' && q && lowest.get(c.option.key) === q.id
                  return (
                    <XlCell key={`${ins.key}:${c.option.key}`} strong={!!best} title={q ? (best ? 'Lowest for this option' : r.title?.(q)) : undefined}>
                      {q ? r.value(q) : ''}
                    </XlCell>
                  )
                }))}
              </XlRow>
            ))}
            <XlRow>
              <XlCell label align="left" muted>Thread</XlCell>
              {grid.insurers.map(ins => perInsurer(ins, i => i.dispatch?.threadHref
                ? <Link href={i.dispatch.threadHref} className="no-underline hover:underline" style={{ color: INK }}>Open</Link>
                : ''))}
            </XlRow>
            <XlRow>
              <XlCell label align="left" muted>In next email</XlCell>
              {perCell(c => {
                const q = c.quote
                if (!q || c.state !== 'quoted' || q.status === 'not_chosen') return ''
                return <input type="checkbox" aria-label={`Include ${c.option.label} from this insurer in the comparison email`} checked={!leftOut.has(q.id)} onChange={() => onToggleEmail(q.id)} className="align-middle cursor-pointer" />
              })}
            </XlRow>
            <XlRow>
              <XlCell label align="left" muted>Sent to client</XlCell>
              {perCell(c => c.quote && shared.has(c.quote.id) ? fmtDate(shared.get(c.quote.id)!) : '')}
            </XlRow>
            <XlRow>
              <XlCell label align="left" muted>Client choice</XlCell>
              {grid.insurers.flatMap(ins => ins.cells.map(c => {
                const q = c.quote
                const key = `${ins.key}:${c.option.key}`
                if (!q) return <XlCell key={key} />
                if (q.status === 'selected' || q.id === chosenId) return <XlCell key={key} fill="pick" strong>Chosen</XlCell>
                if (q.id === pos.line.picked_quote_id && q.dispatch_id) return <XlCell key={key} fill="pick" title="The confirmation to the insurer is drafted or sent">Picked</XlCell>
                if (bound || q.status === 'not_chosen' || c.state !== 'quoted') return <XlCell key={key} />
                return (
                  <XlCell key={key}>
                    <Btn size="xs" level="tertiary" className={XL_BTN} disabled={busy !== null} loading={busy === q.id} onClick={() => pick(q.id)}
                      title="Drafts the confirmation to this insurer; sending it binds the policy">Client chose</Btn>
                  </XlCell>
                )
              }))}
            </XlRow>
          </tbody>
        </XlGrid>
      )}
    </div>
  )
}
