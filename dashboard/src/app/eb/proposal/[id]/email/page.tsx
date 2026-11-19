'use client'

/**
 * Email to client (Jarod, 19 Nov 2026): a full page. The message on the left in the Inbox's
 * RichEditor (tables included), the proposal PDF beside it, the checks above Send. The draft is
 * made once on the client thread (POST /api/eb/quotations/<id>/draft); Send goes through
 * /api/email/send unchanged, then the proposal is recorded as sent and the page opens the company
 * on Working on. No model is called.
 */
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { Btn, Spinner, inputCls } from '@/components/crm/primitives'
import { RichEditor } from '@/components/RichEditor'
import { Checks, PdfPreview, useQuotation } from '@/components/eb/proposal-shared'
import type { ProposalCheck } from '@/lib/gb/eb-proposal'

type Draft = { draftId: string; to: string; cc: string[]; subject: string; html: string; attachment: { filename: string; mime_type: string; storage_url: string }; threadId: string | null }
type Sender = { email: string; label: string; type: 'shared' | 'personal' }
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const splitCc = (v: string) => v.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)

export default function ProposalEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { view, error: loadError } = useQuotation(id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [needTo, setNeedTo] = useState(false)
  const [senders, setSenders] = useState<Sender[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState<'draft' | 'save' | 'send' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const q = view?.quotation

  async function prepare(toAddress?: string) {
    setBusy('draft'); setError(null)
    try {
      const res = await fetch(`/api/eb/quotations/${id}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toAddress ? { to: toAddress } : {}) })
      const d = await res.json().catch(() => ({}))
      if (res.status === 409 && /client/i.test(d.error ?? '')) { setNeedTo(true); return }
      if (!res.ok) { setError(d.error ?? `The email could not be prepared (${res.status}).`); return }
      const x = d as Draft
      setDraft(x); setNeedTo(false); setTo(x.to); setCc(x.cc.join(', ')); setSubject(x.subject); setHtml(x.html)
    } catch (e) { setError(e instanceof Error ? e.message : 'The email could not be prepared.') } finally { setBusy(null) }
  }
  useEffect(() => {
    if (!q) return
    if (q.sent_at) return
    void prepare()
    fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).then((s: Sender[]) => { const list = Array.isArray(s) ? s : []; setSenders(list); if (list[0]) setFrom(list[0].email) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id])

  const extra = useMemo<ProposalCheck[]>(() => {
    const out: ProposalCheck[] = []
    const domain = (e: string) => e.split('@')[1]?.toLowerCase() ?? ''
    if (draft && to && EMAIL.test(to) && draft.to && domain(to) !== domain(draft.to)) out.push({ kind: 'warn', label: 'Recipient', text: `To is outside ${domain(draft.to)}, the client’s domain on the thread.` })
    return out
  }, [draft, to])

  async function save() {
    if (!EMAIL.test(to.trim())) { setError('To must be one email address.'); return }
    setBusy('save'); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/eb/quotations/${id}/draft`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: to.trim(), cc: splitCc(cc), subject, html }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'The draft was not saved.'); return }
      setNotice('Draft saved on the client’s thread.')
    } catch (e) { setError(e instanceof Error ? e.message : 'The draft was not saved.') } finally { setBusy(null) }
  }

  async function send() {
    if (!draft) return
    const toIssue = !EMAIL.test(to.trim()) ? 'To must be one email address.' : null
    const bad = splitCc(cc).filter(e => !EMAIL.test(e))
    if (toIssue || bad.length) { setError(toIssue ?? `Not an email address: ${bad.join(', ')}`); setConfirming(false); return }
    setBusy('send'); setError(null)
    try {
      const res = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        draftId: draft.draftId, htmlBody: html, toEmail: to.trim(), cc: splitCc(cc), customSubject: subject, fromEmail: from || null, attachments: [draft.attachment],
      }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? `The email was not sent (${res.status}).`); setConfirming(false); return }
      await fetch(`/api/eb/quotations/${id}/sent`, { method: 'POST' }).catch(() => {})
      router.push(q?.company_id ? `/companies/${q.company_id}?tab=working&sent=proposal` : `/eb/proposal/${id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'The email was not sent.'); setConfirming(false) } finally { setBusy(null) }
  }

  const owner = q ? { label: `Proposal V${q.version}`, href: `/eb/proposal/${id}` } : { label: 'Employment Benefits', href: '/eb' }
  const warn = [...(view?.checks ?? []), ...extra].filter(c => c.kind === 'warn')
  const field = 'grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-trs-line py-2 text-[13px] text-trs-muted'
  const bare = 'h-9 w-full min-w-0 border-0 bg-transparent px-0 text-[14.5px] text-trs-ink outline-none focus-visible:ring-2 focus-visible:ring-[#1f4e3a] rounded-[4px]'
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 pt-8 pb-20 flex flex-col gap-5">
        <Breadcrumbs current={{ label: 'Email to client', href: `/eb/proposal/${id}/email` }} fallback={owner} />
        {loadError && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{loadError}</p>}
        {!view ? (loadError ? null : <Spinner label="Reading the quotation…" />) : q!.sent_at ? (
          <p className="m-0 text-[14px]">This proposal was sent to {q!.sent_to}. <Link href={`/eb/proposal/${id}`} className="underline">Open the proposal</Link></p>
        ) : <>
          <PageHeader title="Email to client" meta={`${q!.company_name} · Proposal V${q!.version} attached · ${draft?.threadId ? 'reply on the client’s thread' : 'new email'} · written from the quotation, no model`} />
          {needTo && (
            <div className="flex flex-wrap items-end gap-2 max-w-[560px]">
              <label className="flex-1 min-w-[240px] flex flex-col gap-1 text-[13px] text-trs-muted">The quotation has no client thread. Client’s email address
                <input className={inputCls} value={to} onChange={e => setTo(e.target.value)} type="email" />
              </label>
              <Btn level="primary" loading={busy === 'draft'} disabled={!EMAIL.test(to.trim())} onClick={() => void prepare(to.trim())}>Prepare email</Btn>
            </div>
          )}
          {!draft && !needTo && (busy === 'draft' ? <Spinner label="Preparing the email and the PDF…" /> : null)}
          {draft && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-7 items-start min-w-0">
              <div className="flex flex-col min-w-0">
                <label className={field}>From
                  <select className={bare} value={from} onChange={e => setFrom(e.target.value)}>{senders.map(s => <option key={s.email} value={s.email}>{s.label} · {s.email}</option>)}</select>
                </label>
                <label className={field}>To<input className={bare} value={to} onChange={e => setTo(e.target.value)} type="email" /></label>
                <label className={field}>Cc<input className={bare} value={cc} onChange={e => setCc(e.target.value)} /></label>
                <label className={field}>Subject<input className={bare} value={subject} onChange={e => setSubject(e.target.value)} /></label>
                <div className="border-b border-trs-line py-2 min-w-0">
                  <RichEditor initialHtml={draft.html} onChange={setHtml} minHeight={360} borderless />
                </div>
                <div className="flex items-center gap-3 border-b border-trs-line py-3">
                  <span className="inline-flex h-10 w-8 items-end justify-center rounded-[4px] border border-trs-line-2 pb-1 text-[9px] font-medium text-trs-neg" aria-hidden>PDF</span>
                  <span className="min-w-0"><span className="block text-[14px] font-medium break-words">{draft.attachment.filename}</span><span className="block text-[12.5px] text-trs-muted">Previewed on the right</span></span>
                </div>
              </div>
              <div className="lg:sticky lg:top-4 flex flex-col gap-2 min-w-0">
                <span className="text-[12.5px] text-trs-muted">Attachment preview</span>
                <PdfPreview id={id} height={760} />
              </div>
            </div>
          )}
          {draft && <Checks checks={view.checks} extra={extra} />}
          {confirming && (
            <div className="flex flex-col gap-2 rounded-[10px] border-[1.5px] border-trs-green px-4 py-3" role="alertdialog" aria-label="Send email">
              <p className="m-0 text-[14.5px]">Send to {to.trim()} with Proposal V{q!.version} attached?</p>
              {warn.length > 0 && <p className="m-0 text-[13px] text-trs-muted">{warn.length} check{warn.length === 1 ? '' : 's'} open: {warn.map(w => w.label).join(', ')}</p>}
              <div className="flex justify-end gap-2"><Btn onClick={() => setConfirming(false)}>Cancel</Btn><Btn level="primary" loading={busy === 'send'} onClick={() => void send()}>Send</Btn></div>
            </div>
          )}
          {error && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
          {notice && <p className="m-0 text-[13.5px] text-trs-pos" role="status">{notice}</p>}
          {draft && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-trs-ink pt-4">
              <Link href={`/eb/proposal/${id}`} className="text-[14px] text-trs-muted no-underline hover:underline">Back to proposal</Link>
              <div className="flex gap-2">
                <Btn loading={busy === 'save'} disabled={!!busy} onClick={() => void save()}>Save draft</Btn>
                <Btn level="primary" disabled={!!busy || confirming || !to.trim()} onClick={() => setConfirming(true)}>Send</Btn>
              </div>
            </div>
          )}
        </>}
      </div>
    </div>
  )
}
