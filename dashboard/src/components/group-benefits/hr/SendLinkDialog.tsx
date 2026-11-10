'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Btn, Field, inputCls, textareaCls } from '@/components/crm/primitives'
import type { HrLink } from '@/lib/hr/types'
import { HrModal } from './HrModal'
import { defaultMessage, EMAIL_OK, fmtLongDate, type HrLinkCreateResponse } from './labels'

const MUTED = '#4a5550'
const FROM_LINE = 'Trade Risk Solutions Operations · operations@trade-risksol.com · reply-to the same'

import { CompanyField, type CompanyPick } from '../CompanyField'
export type { CompanyPick }

/**
 * Send HR a link. Company by typeahead on /api/companies?search=, the recipient, an optional copy,
 * who asked for the quote, the policy start, and the three opening paragraphs, editable. The rest of
 * the email is fixed server-side. Preview shows the paragraphs as the email will carry them.
 */
export function SendLinkDialog({ open, onClose, onSent, initialCompany, initialEffectiveDate, quotationId }: {
  open: boolean
  onClose: () => void
  onSent: (link: HrLink, mailError?: string, url?: string) => void
  initialCompany?: CompanyPick | null
  initialEffectiveDate?: string | null
  quotationId?: string | null
}) {
  const [company, setCompany] = useState<CompanyPick>({ id: null, name: '' })
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccEmail, setCcEmail] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [message, setMessage] = useState('')
  const [messageEdited, setMessageEdited] = useState(false)
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset on open, taking the company the caller arrived with.
  useEffect(() => {
    if (!open) return
    setCompany(initialCompany ?? { id: null, name: '' })
    setRecipientName(''); setRecipientEmail(''); setCcEmail(''); setRequestedBy(''); setEffectiveDate(initialEffectiveDate ?? '')
    setMessage(''); setMessageEdited(false); setPreview(false); setSending(false); setError(null)
  }, [open, initialCompany?.id, initialCompany?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // The message follows the fields until the broker edits it by hand.
  const generated = useMemo(() => defaultMessage({ recipientName, companyName: company.name, effectiveDate: effectiveDate || null, requestedBy }), [recipientName, company.name, effectiveDate, requestedBy])
  useEffect(() => { if (!messageEdited) setMessage(generated) }, [generated, messageEdited])

  const problems = useMemo(() => {
    const p: string[] = []
    if (!company.name.trim()) p.push('Company is required.')
    if (!recipientName.trim()) p.push('Recipient name is required.')
    if (!EMAIL_OK(recipientEmail)) p.push('Recipient email is not a valid address.')
    if (ccEmail.trim() && !EMAIL_OK(ccEmail)) p.push('Copy email is not a valid address.')
    if (!message.trim()) p.push('Message is empty.')
    return p
  }, [company.name, recipientName, recipientEmail, ccEmail, message])

  async function send() {
    if (problems.length) { setError(problems[0]); return }
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/hr-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id, company_name: company.name.trim(), quotation_id: quotationId ?? null,
          effective_date: effectiveDate || null, recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(),
          cc_email: ccEmail.trim() || null, requested_by: requestedBy.trim() || null, message: message.trim(),
        }),
      })
      const d = await res.json().catch(() => ({})) as HrLinkCreateResponse
      if (!res.ok || !d.link) { setError(d.error ?? `Could not send (${res.status}).`); return }
      onSent(d.link, d.mailError, d.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally { setSending(false) }
  }

  return (
    <HrModal open={open} onClose={onClose} title="Send HR a link">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <CompanyField value={company} onChange={setCompany} />
          </div>
          <Field label="Recipient name"><input className={inputCls} value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Soh Lay Yen" autoComplete="off" /></Field>
          <Field label="Recipient email"><input className={inputCls} type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="hr@company.sg" autoComplete="off" /></Field>
          <Field label="Copy"><input className={inputCls} type="email" value={ccEmail} onChange={e => setCcEmail(e.target.value)} placeholder="Optional" autoComplete="off" /></Field>
          <Field label="Requested by"><input className={inputCls} value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="The person who asked for the quote" autoComplete="off" /></Field>
          <Field label="Policy start"><input className={inputCls} type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} /></Field>
          <Field label="Reference"><div className={cn(inputCls, 'flex items-center')} style={{ color: MUTED }}>Assigned on send · valid 7 days</div></Field>
          <div className="sm:col-span-2">
            <Field label="From"><div className={cn(inputCls, 'flex items-center truncate')} style={{ color: MUTED }}>{FROM_LINE}</div></Field>
          </div>
        </div>

        {!preview ? (
          <Field label="Message">
            <textarea className={textareaCls} rows={8} value={message} onChange={e => { setMessage(e.target.value); setMessageEdited(true) }} />
          </Field>
        ) : (
          <div>
            <span className="block text-[12.5px] mb-1.5" style={{ color: MUTED }}>Preview</span>
            <EmailPreview company={company.name} recipientName={recipientName} recipientEmail={recipientEmail} cc={ccEmail} message={message} effectiveDate={effectiveDate || null} />
          </div>
        )}

        <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>
          The rest of the email is fixed: what is collected, what is not, how it is used, the button, and the signature.
        </p>

        {error && <p className="m-0 text-[12.5px]" style={{ color: '#a1242f' }}>{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {messageEdited && !preview && (
            <Btn type="button" level="tertiary" onClick={() => { setMessageEdited(false); setMessage(generated) }}>Reset message</Btn>
          )}
          <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
          <Btn type="button" level="secondary" onClick={() => setPreview(p => !p)}>{preview ? 'Edit message' : 'Preview email'}</Btn>
          <Btn type="button" level="primary" onClick={send} loading={sending} disabled={problems.length > 0}>Send from operations@</Btn>
        </div>
      </div>
    </HrModal>
  )
}

/** The email as HR will read it: header, the broker's paragraphs, then the fixed parts. */
function EmailPreview({ company, recipientName, recipientEmail, cc, message, effectiveDate }: {
  company: string; recipientName: string; recipientEmail: string; cc: string; message: string; effectiveDate: string | null
}) {
  const expires = new Date(Date.now() + 7 * 86_400_000)
  const expiresWord = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' }).format(expires)
  const shortCompany = company.trim().replace(/\s+(pte\.?\s+ltd\.?|ltd\.?|limited|llp|inc\.?)$/i, '') || '[company]'
  return (
    <div className="rounded-[12px] bg-[#faf9f6] px-5 py-4 text-[13.5px] leading-[1.6]" style={{ color: '#2a332f' }}>
      <div className="text-[12.5px] mb-3" style={{ color: MUTED }}>
        <div>From: Trade Risk Solutions Operations &lt;operations@trade-risksol.com&gt;</div>
        <div>To: {recipientName.trim() || '[recipient]'} &lt;{recipientEmail.trim() || '[email]'}&gt;</div>
        {cc.trim() && <div>Cc: {cc.trim()}</div>}
        <div>Subject: Employee list for {shortCompany}&apos;s group benefits quotation · ref GB-{new Date().getFullYear()}-NNNN</div>
      </div>
      <div className="text-[11px] font-semibold tracking-[0.12em] mb-3" style={{ color: '#132c1c' }}>TRADE RISK SOLUTIONS <span className="font-normal tracking-normal" style={{ color: MUTED }}>· Reference GB-{new Date().getFullYear()}-NNNN</span></div>
      {message.split(/\n{2,}/).map((p, i) => <p key={i} className="m-0 mb-3 whitespace-pre-wrap">{p}</p>)}
      <p className="m-0 mb-1 font-medium" style={{ color: '#0f1412' }}>What we ask for</p>
      <ul className="m-0 mb-3 pl-5">
        <li>Each employee: name, date of birth, gender, category or grade, work pass type, hire date.</li>
        <li>Each dependant to be covered: name, relationship, date of birth.</li>
      </ul>
      <p className="m-0 mb-3"><span className="font-medium" style={{ color: '#0f1412' }}>What we do not ask for:</span> salaries, NRIC or passport numbers, home addresses, or any medical information.</p>
      <div className="inline-flex items-center h-9 px-5 rounded-[7px] text-white text-[14px] font-medium mb-3" style={{ background: '#132c1c' }}>Open the secure page</div>
      <p className="m-0 mb-3">The link is personal to you and expires on {expiresWord}. If the button does not work, copy the address in the email into your browser.</p>
      <p className="m-0 mb-3">The information is used only to obtain quotations from insurers for this policy{effectiveDate ? ` starting ${fmtLongDate(effectiveDate)}` : ''}, is held under our personal data protection policy, and is deleted on request. If you were not expecting this email, reply to this address or call us and we will stop.</p>
      <p className="m-0" style={{ color: MUTED }}>Signature and footer are added on send.</p>
    </div>
  )
}
