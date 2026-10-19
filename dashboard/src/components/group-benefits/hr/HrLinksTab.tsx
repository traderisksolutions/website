'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Btn } from '@/components/crm/primitives'
import type { HrLink } from '@/lib/hr/types'
import { SendLinkDialog, type CompanyPick } from './SendLinkDialog'
import { CHIP, fmtDate, linkStatusWord, MIGRATION_PENDING_LINE, type HrLinkRow, type HrLinksListResponse } from './labels'

const MUTED = '#5f6368'

/**
 * The HR links register on the Pricing Matrix page: every link sent to a client's HR, its status
 * word, and what came back. `Send a link` opens the dialog; a row opens the link's page.
 * `openSend` with `initialCompany` is how the company page arrives with the company filled in.
 */
export function HrLinksTab({ openSend, initialCompany, onDialogClosed }: {
  openSend?: boolean
  initialCompany?: CompanyPick | null
  onDialogClosed?: () => void
}) {
  const router = useRouter()
  const [rows, setRows] = useState<HrLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState(!!openSend)
  const [notice, setNotice] = useState<{ text: string; linkId: string; url?: string } | null>(null)

  useEffect(() => { if (openSend) setDialog(true) }, [openSend])

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
          {loading ? 'Loading…' : pending ? MIGRATION_PENDING_LINE : `${rows.length} link${rows.length === 1 ? '' : 's'}`}
        </p>
        <Btn level="primary" onClick={() => setDialog(true)} disabled={pending}>Send a link</Btn>
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
        <Register label="HR links" minWidth={920}>
          <RegisterHead>
            <RegisterTh first width={200}>Reference</RegisterTh>
            <RegisterTh>Company</RegisterTh>
            <RegisterTh>Recipient</RegisterTh>
            <RegisterTh>Status</RegisterTh>
            <RegisterTh>Sent</RegisterTh>
            <RegisterTh>Submitted</RegisterTh>
            <RegisterTh last align="right">Lives</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.length === 0 && <RegisterEmpty colSpan={7}>No links sent yet.</RegisterEmpty>}
            {rows.map(r => {
              const n = lives(r)
              return (
                <RegisterRow key={r.id} onClick={() => router.push(`/pricing-matrix/hr-links/${r.id}`)}>
                  <RegisterCell first identityWidth={180} primary={r.reference} secondary={r.effective_date ? `effective ${fmtDate(r.effective_date)}` : 'no policy start'} />
                  <RegisterCell className="max-w-[260px]"><span className="block text-[14px] truncate" style={{ color: '#202124' }} title={r.company_name}>{r.company_name}</span></RegisterCell>
                  <RegisterCell primary={<span className="text-[14px] font-normal">{r.recipient_name}</span>} secondary={r.recipient_email} />
                  <RegisterCell><span className={CHIP}>{linkStatusWord(r)}</span></RegisterCell>
                  <RegisterCell primary={fmtDate(r.sent_at)} secondary={`valid to ${fmtDate(r.expires_at)}`} />
                  <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: r.submitted_at ? '#202124' : '#9aa0a6' }}>{r.submitted_at ? fmtDate(r.submitted_at) : '—'}</span></RegisterCell>
                  <RegisterCell last align="right"><span className="text-[14px] tabular-nums" style={{ color: n != null ? '#202124' : '#9aa0a6' }}>{n ?? '—'}</span></RegisterCell>
                </RegisterRow>
              )
            })}
          </tbody>
        </Register>
      )}

      <SendLinkDialog open={dialog} onClose={closeDialog} onSent={sent} initialCompany={initialCompany} />
    </div>
  )
}
