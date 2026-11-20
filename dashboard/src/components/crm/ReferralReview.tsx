'use client'

/**
 * The referral list for review (`src/lib/crm/referral-review.ts`): every company of kind partner
 * with what its emails show. Kind sets what the company is; Keep leaves it a referral. Either
 * marks the record as checked by a person. A row stays for the sitting after it is decided, so
 * a choice can be changed.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Btn, Empty } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { selectCls } from '@/components/cases/shared'
import { DASH, fmtDay } from '@/lib/format'
import { COMPANY_KINDS, type CompanyKind } from '@/lib/crm/types'
import type { ReferralRow } from '@/lib/crm/referral-review'

const KIND_NAME: Record<CompanyKind, string> = { partner: 'Referral', client: 'Client', insurer: 'Insurer', tpa: 'Third-party administrator', vendor: 'Vendor', other: 'Other' }
const KINDS: CompanyKind[] = ['partner', ...COMPANY_KINDS.filter(k => k !== 'partner')]
const dash = <span className="text-trs-muted">{DASH}</span>

export function ReferralReview({ rows, onChange, onNotice, onError }: {
  rows: ReferralRow[]
  onChange: (rows: ReferralRow[]) => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(r: ReferralRow, kind: CompanyKind) {
    setBusy(r.id); onError(null)
    try {
      const d = await callApi<{ company: { confirmed_at?: string | null; confirmed_by?: string | null } | null }>(`/api/companies/${r.id}`, { method: 'PATCH', body: { kind, confirmed: true } })
      onChange(rows.map(x => x.id === r.id ? { ...x, kind, checkedAt: d.company?.confirmed_at ?? new Date().toISOString(), checkedBy: d.company?.confirmed_by ?? null } : x))
      onNotice(kind === 'partner' ? `${r.name} kept as a referral.` : `${r.name} set to ${KIND_NAME[kind].toLowerCase()}.`)
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }

  if (rows.length === 0) return <Empty>No referrals on file.</Empty>

  return (
    <div className="overflow-x-auto rounded-[10px] border border-trs-line bg-white">
      <table className="trs-table table-fixed" style={{ minWidth: 1040 }} aria-label="Referrals">
        <colgroup><col style={{ width: '20%' }} /><col style={{ width: '15%' }} /><col style={{ width: 78 }} /><col style={{ width: 84 }} /><col /><col style={{ width: 128 }} /><col style={{ width: 150 }} /><col style={{ width: 104 }} /></colgroup>
        <thead><tr><th>Company</th><th>Domain</th><th>Threads</th><th>From TRS</th><th>Last email</th><th>Reads as</th><th>Kind</th><th>Checked</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="align-top">
              <td className="px-3 py-2"><Link href={`/companies/${r.id}`} className="text-[13px] text-trs-ink no-underline hover:underline [overflow-wrap:anywhere]">{r.name}</Link></td>
              <td className="cell-left px-3 py-2 text-[13px] [overflow-wrap:anywhere]">
                {r.domains.length ? r.domains.join(', ') : dash}
                {r.shared.map(o => <span key={o.id} className="block text-trs-ink-2">Also on <Link href={`/companies/${o.id}`} className="text-trs-ink-2 underline">{o.name}</Link></span>)}
              </td>
              <td className="px-3 py-2 tabular-nums">{r.threads}</td>
              <td className="px-3 py-2 tabular-nums">{r.fromTrs}</td>
              <td className="cell-left px-3 py-2 text-[13px]">
                {!r.last ? dash : (
                  <>
                    <span className="block tabular-nums whitespace-nowrap">{fmtDay(r.last.at)}</span>
                    <span className="block text-trs-ink-2 [overflow-wrap:anywhere]">{r.last.private ? 'In a colleague’s mailbox' : r.last.subject ?? 'No subject'}</span>
                  </>
                )}
              </td>
              <td className="cell-left px-3 py-2 text-[13px]">
                {r.voice.referral + r.voice.market === 0 ? dash : (
                  <>
                    {r.voice.referral > 0 && <span className="block whitespace-nowrap">Referral · {r.voice.referral}</span>}
                    {r.voice.market > 0 && <span className="block whitespace-nowrap">Market · {r.voice.market}</span>}
                  </>
                )}
              </td>
              <td className="px-2 py-1.5">
                <select className={`${selectCls} w-full`} aria-label={`Kind of ${r.name}`} value={r.kind} disabled={busy !== null} onChange={e => void decide(r, e.target.value as CompanyKind)}>
                  {KINDS.map(k => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
                </select>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                {r.checkedAt ? fmtDay(r.checkedAt) : <Btn size="xs" disabled={busy !== null} loading={busy === r.id} onClick={() => void decide(r, 'partner')}>Keep</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
