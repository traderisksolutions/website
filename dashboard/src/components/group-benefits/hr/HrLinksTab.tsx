'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Btn } from '@/components/crm/primitives'
import type { HrLink } from '@/lib/hr/types'
import { SendLinkDialog, type CompanyPick } from './SendLinkDialog'
import { CHIP, fmtDate, linkStatusWord, MIGRATION_PENDING_LINE, type HrLinkDetailResponse, type HrLinkRow, type HrLinksListResponse } from './labels'
import type { EbPolicyRow } from '@/app/api/eb/policies/route'

const MUTED = '#5f6368'

/**
 * The Employee lists tab (HR links) on the Employment Benefits page: every link sent to a client's HR, its status
 * word, and what came back. `Send a link` opens the dialog; a row opens the link's page.
 * `openSend` with `initialCompany` is how the company page arrives with the company filled in.
 */
export function HrLinksTab({ openSend, initialCompany, initialEffectiveDate, initialQuotationId, onDialogClosed }: {
  openSend?: boolean
  initialCompany?: CompanyPick | null
  initialEffectiveDate?: string | null
  initialQuotationId?: string | null
  onDialogClosed?: () => void
}) {
  const router = useRouter()
  const [rows, setRows] = useState<HrLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState(!!openSend)
  const [notice, setNotice] = useState<{ text: string; linkId: string; url?: string } | null>(null)
  // Links sent for a policy (company spine) price on that policy's placement line, not through Quick quote.
  const [policies, setPolicies] = useState<Map<string, EbPolicyRow>>(new Map())
  const [pricing, setPricing] = useState<string | null>(null)

  useEffect(() => { if (openSend) setDialog(true) }, [openSend])
  useEffect(() => {
    fetch('/api/eb/policies', { cache: 'no-store' }).then(r => r.ok ? r.json() : { policies: [] })
      .then((d: { policies?: EbPolicyRow[] }) => setPolicies(new Map((d.policies ?? []).map(p => [p.id, p]))))
      .catch(() => {})
  }, [])

  /** The submitted list priced on the policy's line, then the company's Members tab. */
  async function priceOnPolicy(r: HrLinkRow, policy: EbPolicyRow) {
    if (!policy.placement_line_id) { setError('The policy has no placement line; open the company and recreate the placement.'); return }
    setPricing(r.id); setError(null)
    try {
      const dr = await fetch(`/api/group-benefits/hr-links/${r.id}`, { cache: 'no-store' })
      const dd = await dr.json().catch(() => ({})) as HrLinkDetailResponse
      const submissionId = dd.submission?.status === 'submitted' ? dd.submission.id : null
      if (!dr.ok || !submissionId) { setError(dd.error ?? 'The link has no submitted list yet.'); return }
      const pr = await fetch(`/api/placements/lines/${policy.placement_line_id}/price`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id: submissionId }),
      })
      const pd = await pr.json().catch(() => ({})) as { error?: string; quotes?: unknown[] }
      if (!pr.ok) { setError(pd.error ?? `Pricing failed (${pr.status}).`); return }
      router.push(`/companies/${policy.company_id}?tab=members`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pricing failed.')
    } finally { setPricing(null) }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/hr-links', { cache: 'no-store' })
      const d = await res.json().catch(() => ({})) as HrLinksListResponse
      if (d.migrationPending) { setPending(true); setRows([]); return }
      if (!res.ok) { setError(d.error ?? `Could not load links (${res.status}).`); setRows([]); return }
      setPending(false)
      setRows(Array.isArray(d.links) ? d.links : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load links.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function closeDialog() { setDialog(false); onDialogClosed?.() }

  function sent(link: HrLink, mailError?: string, url?: string) {
    closeDialog()
    setNotice(mailError
      ? { text: `${link.reference} created for ${link.company_name}. The email did not send: ${mailError}. Copy the link and send it yourself, or use Resend.`, linkId: link.id, url }
      : { text: `${link.reference} sent to ${link.recipient_email}.`, linkId: link.id, url })
    void load()
  }

  const lives = (r: HrLinkRow): number | null => {
    if (typeof r.lives === 'number') return r.lives
    if (typeof r.employee_count === 'number') return r.employee_count + (r.dependant_count ?? 0)
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="m-0 text-[13.5px] tabular-nums" style={{ color: MUTED }}>
          {loading ? 'Loading…' : pending ? MIGRATION_PENDING_LINE : `${rows.length} requested from client HR`}
        </p>
        <Btn level="secondary" onClick={() => setDialog(true)} disabled={pending}>Send HR a link</Btn>
      </div>

      {notice && (
        <p className="m-0 text-[13.5px]" style={{ color: '#3c4043' }}>
          {notice.text}{' '}
          <button onClick={() => router.push(`/pricing-matrix/hr-links/${notice.linkId}`)} className="bg-transparent border-0 p-0 cursor-pointer underline" style={{ color: '#202124' }}>Open</button>
          {notice.url && <>{' · '}<button onClick={() => { void navigator.clipboard?.writeText(notice.url!).catch(() => {}) }} className="bg-transparent border-0 p-0 cursor-pointer underline" style={{ color: '#202124' }}>Copy link</button></>}
        </p>
      )}
      {error && <p className="m-0 text-[13.5px]" style={{ color: '#c5221f' }}>{error}</p>}

      {!pending && !loading && (
        <Register label="Employee lists" minWidth={920}>
          <RegisterHead>
            <RegisterTh first width={200}>Reference</RegisterTh>
            <RegisterTh>Company</RegisterTh>
            <RegisterTh>Recipient</RegisterTh>
            <RegisterTh>Status</RegisterTh>
            <RegisterTh>Sent</RegisterTh>
            <RegisterTh>Submitted</RegisterTh>
            <RegisterTh align="right">Lives</RegisterTh>
            <RegisterTh last align="right">{''}</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.length === 0 && <RegisterEmpty colSpan={8}>No employee lists requested yet.</RegisterEmpty>}
            {rows.map(r => {
              const n = lives(r)
              const policy = r.policy_id ? policies.get(r.policy_id) ?? null : null
              const policyHref = r.policy_id && r.company_id ? `/companies/${r.company_id}?tab=members` : null
              return (
                <RegisterRow key={r.id} onClick={() => router.push(`/pricing-matrix/hr-links/${r.id}`)}>
                  <RegisterCell first identityWidth={180} primary={r.reference} secondary={r.effective_date ? `effective ${fmtDate(r.effective_date)}` : 'no policy start'} />
                  <RegisterCell className="max-w-[260px]">
                    <span className="block text-[14px] truncate" style={{ color: '#202124' }} title={r.company_name}>{r.company_name}</span>
                    {policyHref && (
                      <Link href={policyHref} onClick={e => e.stopPropagation()} className="block text-[12.5px] truncate no-underline hover:underline" style={{ color: MUTED }}>
                        {policy ? `${policy.label} · ${policy.lifecycle_label}` : 'Policy'}
                      </Link>
                    )}
                  </RegisterCell>
                  <RegisterCell primary={<span className="text-[14px] font-normal">{r.recipient_name}</span>} secondary={r.recipient_email} />
                  <RegisterCell><span className={CHIP}>{linkStatusWord(r)}</span></RegisterCell>
                  <RegisterCell primary={fmtDate(r.sent_at)} secondary={`valid to ${fmtDate(r.expires_at)}`} />
                  <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: r.submitted_at ? '#202124' : '#9aa0a6' }}>{r.submitted_at ? fmtDate(r.submitted_at) : '—'}</span></RegisterCell>
                  <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: n != null ? '#202124' : '#9aa0a6' }}>{n ?? '—'}</span></RegisterCell>
                  <RegisterCell last align="right">
                    {r.submitted_at
                      ? (policy
                        ? <Btn size="xs" level="primary" loading={pricing === r.id} onClick={e => { e.stopPropagation(); void priceOnPolicy(r, policy) }}>Quote</Btn>
                        : <Btn size="xs" level="primary" onClick={e => { e.stopPropagation(); router.push(`/pricing-matrix?tab=quote&hrLink=${r.id}`) }}>Quote</Btn>)
                      : <span className="text-[13px]" style={{ color: '#9aa0a6' }}>Waiting for HR</span>}
                  </RegisterCell>
                </RegisterRow>
              )
            })}
          </tbody>
        </Register>
      )}

      <SendLinkDialog open={dialog} onClose={closeDialog} onSent={sent} initialCompany={initialCompany} initialEffectiveDate={initialEffectiveDate} quotationId={initialQuotationId} />
    </div>
  )
}
