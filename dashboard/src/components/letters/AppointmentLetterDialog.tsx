'use client'

/**
 * Create the letter of broker appointment: the form on the left, the letter on the right as it
 * will print, then Download PDF / Download Word / Draft email to client. Both files are filed in
 * the company's data room (Drive: <Company>/Letters/) the first time either is asked for.
 */
import { useEffect, useMemo, useState } from 'react'
import { Eye, FileText, Mail, Paperclip, RotateCcw } from 'lucide-react'
import { RichEditor } from '@/components/RichEditor'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText, ERROR, INK, MUTED } from '@/components/placement/shared'
import { letterParts, letterProblems, templateHtml } from '@/lib/letters/appointment'

type Saved = { format: 'pdf' | 'docx'; id: string; url: string | null }
type Form = { client_name: string; project_title: string; programme: string; date: string; signatory_name: string; designation: string; entities: string; letterhead: 'client' | 'trs'; body_html: string | null }

export function AppointmentLetterDialog({ open, onClose, companyId, placementId, onDone, onAttach }: {
  open: boolean
  onClose: () => void
  companyId: string
  placementId?: string | null
  onDone?: () => void
  /** Opened from a case on Today: the filed PDF's document id goes onto that case's email. */
  onAttach?: (documentId: string) => Promise<void>
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [f, setF] = useState<Form | null>(null)
  const [saved, setSaved] = useState<Saved[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setF(null); setSaved(null); setError(null); setNotice(null)
    const q = new URLSearchParams({ company_id: companyId, ...(placementId ? { placement_id: placementId } : {}) })
    callApi<{ prefill: Omit<Form, 'signatory_name' | 'designation'> }>(`/api/letters/appointment?${q}`)
      .then(r => setF({ ...r.prefill, signatory_name: '', designation: '', entities: '', letterhead: 'client', body_html: null }))
      .catch(e => setError(errText(e)))
  }, [open, companyId, placementId])

  const letter = useMemo(() => f && ({ clientName: f.client_name, projectTitle: f.project_title, programme: f.programme, date: f.date, signatoryName: f.signatory_name, designation: f.designation,
    entities: f.entities.split('\n').map(x => x.trim()).filter(Boolean), letterhead: f.letterhead, bodyHtml: f.body_html }), [f])
  const parts = letter ? letterParts(letter) : null
  const problems = letter ? letterProblems(letter) : []
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF(v => v ? { ...v, [k]: e.target.value } : v); setSaved(null); setPdfUrl(null) }
  const body = (k: 'body_html' | 'letterhead', v: string | null) => { setF(x => x ? { ...x, [k]: v } as Form : x); setSaved(null); setPdfUrl(null) }
  const payload = () => f && ({ company_id: companyId, placement_id: placementId ?? null, ...f, entities: f.entities.split('\n').map(x => x.trim()).filter(Boolean) })

  async function preview() {
    if (!f || problems.length) { setError(problems.join(' ')); return }
    setBusy('preview'); setError(null)
    try {
      const r = await fetch('/api/letters/appointment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), preview: true }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Preview failed')
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      setPdfUrl(URL.createObjectURL(await r.blob()))
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  async function attach() {
    setBusy('attach')
    const docs = saved ?? await create(false)
    const pdf = docs?.find(x => x.format === 'pdf')
    try { if (pdf && onAttach) { await onAttach(pdf.id); setNotice('Attached to the email on this case.') } } catch (e) { setError(errText(e)) }
    setBusy(null)
  }

  async function create(draftEmail: boolean): Promise<Saved[] | null> {
    if (!f || problems.length) { setError(problems.join(' ')); return null }
    setError(null); setNotice(null)
    try {
      const r = await callApi<{ documents: Saved[]; draft_id?: string | null; draft_error?: string }>('/api/letters/appointment', {
        method: 'POST', body: { ...payload(), draft_email: draftEmail },
      })
      setSaved(r.documents)
      if (draftEmail) setNotice(r.draft_error ?? 'Email to the client drafted with both files attached. Send it from Drafts to approve.')
      onDone?.()
      return r.documents
    } catch (e) {
      setError(errText(e)); return null
    }
  }

  async function download(format: 'pdf' | 'docx') {
    setBusy(format)
    const docs = saved ?? await create(false)
    setBusy(null)
    const d = docs?.find(x => x.format === format)
    if (d) window.open(`/api/documents/${d.id}/file`, '_blank', 'noopener')
  }

  async function draft() {
    setBusy('email')
    await create(true)
    setBusy(null)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[1080px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Appointment letter</DialogTitle>
          <DialogDescription className="sr-only">Letter of broker appointment, signed by the client on its letterhead</DialogDescription>
        </DialogHeader>
        {!f && !error && <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>Loading…</p>}
        {f && parts && (
          <div className="grid gap-6 md:grid-cols-[340px_minmax(0,1fr)] min-w-0">
            <div className="grid gap-3 content-start min-w-0">
              <Field label="Client (signs the letter)"><input className={inputCls} value={f.client_name} onChange={set('client_name')} /></Field>
              <Field label="Re: project or subject (optional)"><input className={inputCls} value={f.project_title} onChange={set('project_title')} placeholder="Proposed residential development at Stevens Road" /></Field>
              <Field label="Insurance programme"><textarea className={textareaCls} rows={3} value={f.programme} onChange={set('programme')} placeholder="insurance policies, or Contractor's All Risks and Public Liability insurance for …" /></Field>
              <Field label="Other entities covered (one per line)"><textarea className={textareaCls} rows={3} value={f.entities} onChange={set('entities')} placeholder="Leave blank for one company" /></Field>
              <Field label="Letterhead">
                <select className={inputCls} value={f.letterhead} onChange={e => body('letterhead', e.target.value)}>
                  <option value="client">Client letterhead (TRS logo in the footer)</option>
                  <option value="trs">TRS logo at the top</option>
                </select>
              </Field>
              <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={set('date')} /></Field>
              <Field label="Signatory name"><input className={inputCls} value={f.signatory_name} onChange={set('signatory_name')} placeholder="Leave blank for the client to fill in" /></Field>
              <Field label="Designation"><input className={inputCls} value={f.designation} onChange={set('designation')} placeholder="Leave blank for the client to fill in" /></Field>
              <Field label="Letter text">
                <div className="rounded-[8px] border border-[#d5d9d4] bg-white min-w-0">
                  <RichEditor key={editorKey} initialHtml={f.body_html ?? templateHtml({ programme: f.programme })} onChange={html => body('body_html', html)} minHeight={170} />
                </div>
              </Field>
              {f.body_html !== null && <Btn size="xs" level="tertiary" onClick={() => { body('body_html', null); setEditorKey(k => k + 1) }}><RotateCcw size={12} /> Reset text to the template</Btn>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Btn level="secondary" disabled={!!busy || problems.length > 0} loading={busy === 'preview'} onClick={() => void preview()}><Eye size={14} /> Preview</Btn>
                {onAttach && <Btn level="primary" disabled={!!busy || problems.length > 0} loading={busy === 'attach'} onClick={() => void attach()}><Paperclip size={14} /> Attach to this email</Btn>}
                <Btn level={onAttach ? 'secondary' : 'primary'} disabled={!!busy || problems.length > 0} loading={busy === 'pdf'} onClick={() => void download('pdf')}><FileText size={14} /> Download PDF</Btn>
                <Btn level="secondary" disabled={!!busy || problems.length > 0} loading={busy === 'docx'} onClick={() => void download('docx')}><FileText size={14} /> Download Word</Btn>
                <Btn level="tertiary" disabled={!!busy || problems.length > 0} loading={busy === 'email'} onClick={() => void draft()}><Mail size={14} /> Draft email to client</Btn>
              </div>
              {error && <p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p>}
              {notice && <p className="m-0 text-[13px]" style={{ color: INK }}>{notice}</p>}
              {saved && (
                <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>
                  Filed in the data room under Letters ·{' '}
                  {saved.map(d => <a key={d.id} href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="underline underline-offset-2 mr-2" style={{ color: INK }}>Open {d.format === 'pdf' ? 'PDF' : 'Word'}</a>)}
                </p>
              )}
            </div>
            {pdfUrl ? (
              <div className="min-w-0 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[12.5px]" style={{ color: MUTED }}><span>The PDF as it will be filed and sent</span><Btn size="xs" level="tertiary" onClick={() => setPdfUrl(null)}>Back to editing view</Btn></div>
                <iframe title="Letter PDF preview" src={pdfUrl} className="w-full min-h-[760px] rounded-[10px] border border-[#e6e8e4] bg-white" />
              </div>
            ) : (
            <div className="min-w-0 rounded-[10px] border border-[#e6e8e4] bg-white shadow-[0_18px_40px_-24px_rgba(19,44,28,0.35)] px-10 pt-24 pb-10 text-[13px] leading-[1.6]" style={{ color: INK }} aria-label="Letter preview">
              {f.letterhead === 'trs' && <img src="/letters/trs-logo.png" alt="TRS" className="w-[120px] -mt-16 mb-8" />}
              <div>{parts.addressee.map(a => <div key={a}>{a}</div>)}</div>
              <div className="mt-5">{parts.date}</div>
              <div className="mt-6 font-semibold text-[14px]">{parts.title}</div>
              {parts.re && <div className="mt-1 font-semibold">Re: {parts.re}</div>}
              {parts.blocks.map((b, i) => (
                <p key={i} className={b.kind === 'li' ? 'mt-1.5 mb-0 pl-5 -indent-4' : 'mt-3 mb-0'}>
                  {b.kind === 'li' ? `${b.ordered ? `${b.n}.` : '•'} ` : ''}
                  {b.runs.map((r, j) => <span key={j} style={{ fontWeight: r.b ? 600 : undefined, fontStyle: r.i ? 'italic' : undefined, textDecoration: r.u ? 'underline' : undefined }}>{r.text}</span>)}
                </p>
              ))}
              {parts.entities.length > 0 && <div className="mt-3"><div>List of entities:</div>{parts.entities.map(e => <div key={e} className="pl-5">• {e}</div>)}</div>}
              <p className="mt-3 mb-0">{parts.closing}</p>
              <div className="mt-14 w-[200px] border-t border-[#0f1412] pt-1">
                <div>{parts.name}</div><div>{parts.designation}</div><div className="font-semibold">{parts.company}</div>
              </div>
              {f.letterhead === 'client' && <div className="mt-12 pt-2 border-t border-[#e6e8e4] flex items-center gap-3 text-[11px]" style={{ color: MUTED }}><img src="/letters/trs-logo.png" alt="" className="w-[44px]" />Template prepared by Trade Risk Solutions. Please print on your company letterhead, sign and return.</div>}
            </div>
            )}
          </div>
        )}
        {!f && error && <p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
