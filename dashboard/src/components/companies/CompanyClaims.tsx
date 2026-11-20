'use client'

/**
 * The company's Claims tab: the claims register (claimsRegister) narrowed to this company,
 * the same rows as /claims?company=<id>. A row opens the claim there.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Empty, LinkBtn, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { callApi, errText } from '@/components/placement/shared'
import { fmtDate, num } from '@/lib/format'
import { bucketOf, type RegisterRow as ClaimRow } from '@/lib/admin/b/register-view'
import { unwrap } from '@/lib/action-result'
import { claimsRegister } from '@/app/claims/actions'

const CLASS: Record<string, string> = { wica: 'WICA', ghs: 'GHS', gpa: 'GPA', motor: 'Motor', property: 'Property', liability: 'Liability', marine: 'Marine', travel: 'Travel', other: 'Other' }
const WAITING: Record<string, string> = { trs: 'TRS', client: 'Client', insurer: 'Insurer', adjuster: 'Adjuster', third_party: 'Third party' }
const word = (s: string | null) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—'

/** Loads once per company; `onCount` reports the open claims for the tab count. */
export function CompanyClaims({ companyId, onCount }: { companyId: string; onCount?: (n: number) => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<ClaimRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setRows(null); setError(null)
    claimsRegister().then(unwrap).then(claims => ({ claims: claims as unknown as ClaimRow[] }))
      .then(d => { if (!live) return; const mine = d.claims.filter(r => r.company_id === companyId); setRows(mine); onCount?.(mine.filter(r => bucketOf(r) === 'open').length) })
      .catch(e => { if (live) setError(errText(e)) })
    return () => { live = false }
  }, [companyId, onCount])

  if (error) return <p className="m-0 text-trs-neg" role="alert">Claims did not load: {error}</p>
  if (!rows) return <Spinner label="Loading claims…" />
  if (rows.length === 0) return <Empty action={<LinkBtn href={`/claims?company=${companyId}`}>Open the claims register</LinkBtn>}>No claims on file for this company.</Empty>

  return (
    <Register label="Claims" minWidth={980}>
      <RegisterHead>
        <RegisterTh first>Claim</RegisterTh><RegisterTh>Class · insurer</RegisterTh><RegisterTh>Loss</RegisterTh><RegisterTh>Status</RegisterTh>
        <RegisterTh>Waiting on</RegisterTh><RegisterTh>Claimed S$</RegisterTh><RegisterTh last>Last mail</RegisterTh>
      </RegisterHead>
      <tbody>
        {rows.map(r => (
          <RegisterRow key={r.id} onClick={() => router.push(`/claims?company=${companyId}&claim=${r.id}`)}>
            <RegisterCell first identityWidth={280} primary={r.title} secondary={r.policy_number ?? undefined} />
            <RegisterCell>{CLASS[r.class] ?? r.class}{r.insurer ? ` · ${r.insurer}` : ''}</RegisterCell>
            <RegisterCell className="tabular-nums">{fmtDate(r.loss_date)}</RegisterCell>
            <RegisterCell>{word(r.stage ?? r.status)}</RegisterCell>
            <RegisterCell>{r.waiting_on ? `${WAITING[r.waiting_on] ?? r.waiting_on}${r.waiting_days != null ? ` · ${r.waiting_days} d` : ''}` : '—'}</RegisterCell>
            <RegisterCell className="tabular-nums">{num(r.amount_claimed)}</RegisterCell>
            <RegisterCell last className="tabular-nums">{fmtDate(r.last_mail_at)}</RegisterCell>
          </RegisterRow>
        ))}
      </tbody>
    </Register>
  )
}
