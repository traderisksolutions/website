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
import { unwrap } from '@/lib/action-result'
import { updateCompany } from '@/app/companies/actions'

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
      const d = unwrap(await updateCompany(r.id, { kind, confirmed: true }))
      onChange(rows.map(x => x.id === r.id ? { ...x, kind, checkedAt: d.company?.confirmed_at ?? new Date().toISOString(), checkedBy: d.company?.confirmed_by ?? null } : x))
      onNotice(kind === 'partner' ? `${r.name} kept as a referral.` : `${r.name} set to ${KIND_NAME[kind].toLowerCase()}.`)
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }

  if (rows.length === 0) return <Empty>No referrals on file.</Empty>

  return (
    <div className="overflow-x-auto">
      <table className="trs-table table-fixed min-w-[1040px]" aria-label="Referrals">
        <colgroup><col className="w-[20%]" /><col className="w-[15%]" /><col className="w-[78px]" /><col className="w-[84px]" /><col /><col className="w-[128px]" /><col className="w-[150px]" /><col className="w-[104px]" /></colgroup>
        <thead><tr><th>Company</th><th>Domain</th><th>Threads</th><th>From TRS</th><th>Last email</th><th>Reads as</th><th>Kind</th><th>Checked</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="align-top">
              <td><Link href={`/companies/${r.id}`} className="text-body text-trs-ink no-underline hover:underline [overflow-wrap:anywhere]">{r.name}</Link></td>
              <td className="cell-left text-body [overflow-wrap:anywhere]">
                {r.domains.length ? r.domains.join(', ') : dash}
                {r.shared.map(o => <span key={o.id} className="block text-trs-ink-2">Also on <Link href={`/companies/${o.id}`} className="text-trs-ink-2 underline">{o.name}</Link></span>)}
              </td>
              <td className="tabular-nums">{r.threads}</td>
              <td className="tabular-nums">{r.fromTrs}</td>
              <td className="cell-left text-body">
                {!r.last ? dash : (
                  <>
                    <span className="block tabular-nums whitespace-nowrap">{fmtDay(r.last.at)}</span>
                    <span className="block text-trs-ink-2 [overflow-wrap:anywhere]">{r.last.private ? 'In a colleague’s mailbox' : r.last.subject ?? 'No subject'}</span>
                  </>
                )}
              </td>
              <td className="cell-left text-body">
                {r.voice.referral + r.voice.market === 0 ? dash : (
                  <>
                    {r.voice.referral > 0 && <span className="block whitespace-nowrap">Referral · {r.voice.referral}</span>}
                    {r.voice.market > 0 && <span className="block whitespace-nowrap">Market · {r.voice.market}</span>}
                  </>
                )}
              </td>
              <td>
                <select className={`${selectCls} w-full`} aria-label={`Kind of ${r.name}`} value={r.kind} disabled={busy !== null} onChange={e => void decide(r, e.target.value as CompanyKind)}>
                  {KINDS.map(k => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
                </select>
              </td>
              <td className="whitespace-nowrap tabular-nums">
                {r.checkedAt ? fmtDay(r.checkedAt) : <Btn size="xs" disabled={busy !== null} loading={busy === r.id} onClick={() => void decide(r, 'partner')}>Keep</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
