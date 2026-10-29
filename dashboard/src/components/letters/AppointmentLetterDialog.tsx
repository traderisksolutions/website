'use client'

/**
 * Create the letter of broker appointment: the form on the left, the letter on the right as it
 * will print, then Download PDF / Download Word / Draft email to client. Both files are filed in
 * the company's data room (Drive: <Company>/Letters/) the first time either is asked for.
 */
import { useEffect, useMemo, useState } from 'react'
import { FileText, Mail } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText, ERROR, INK, MUTED } from '@/components/placement/shared'
import { letterParts, letterProblems } from '@/lib/letters/appointment'

type Saved = { format: 'pdf' | 'docx'; id: string; url: string | null }
type Form = { client_name: string; project_title: string; programme: string; date: string; signatory_name: string; designation: string }

export function AppointmentLetterDialog({ open, onClose, companyId, placementId, onDone }: {
  open: boolean
  onClose: () => void
  companyId: string
  placementId?: string | null
  onDone?: () => void
}) {
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
      .then(r => setF({ ...r.prefill, signatory_name: '', designation: '' }))
      .catch(e => setError(errText(e)))
  }, [open, companyId, placementId])

  const letter = useMemo(() => f && ({ clientName: f.client_name, projectTitle: f.project_title, programme: f.programme, date: f.date, signatoryName: f.signatory_name, designation: f.designation }), [f])
  const parts = letter ? letterParts(letter) : null
  const problems = letter ? letterProblems(letter) : []
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF(v => v ? { ...v, [k]: e.target.value } : v); setSaved(null) }

  async function create(draftEmail: boolean): Promise<Saved[] | null> {
    if (!f || problems.length) { setError(problems.join(' ')); return null }
    setError(null); setNotice(null)
    try {
      const r = await callApi<{ documents: Saved[]; draft_id?: string | null; draft_error?: string }>('/api/letters/appointment', {
        method: 'POST', body: { company_id: companyId, placement_id: placementId ?? null, ...f, draft_email: draftEmail },
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
              <Field label="Project title"><input className={inputCls} value={f.project_title} onChange={set('project_title')} placeholder="Proposed residential development at Stevens Road" /></Field>
              <Field label="Insurance programme"><textarea className={textareaCls} rows={4} value={f.programme} onChange={set('programme')} placeholder="Contractor's All Risks and Public Liability insurance for …" /></Field>
              <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={set('date')} /></Field>
              <Field label="Signatory name"><input className={inputCls} value={f.signatory_name} onChange={set('signatory_name')} placeholder="Leave blank for the client to fill in" /></Field>
              <Field label="Designation"><input className={inputCls} value={f.designation} onChange={set('designation')} placeholder="Leave blank for the client to fill in" /></Field>
              <div className="flex flex-wrap gap-2 pt-1">
                <Btn level="primary" disabled={!!busy || problems.length > 0} loading={busy === 'pdf'} onClick={() => void download('pdf')}><FileText size={14} /> Download PDF</Btn>
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
            <div className="min-w-0 rounded-[10px] border border-[#e6e8e4] bg-white shadow-[0_18px_40px_-24px_rgba(19,44,28,0.35)] px-10 pt-24 pb-10 text-[13px] leading-[1.6]" style={{ color: INK }} aria-label="Letter preview">
              <div>{parts.addressee.map(a => <div key={a}>{a}</div>)}</div>
              <div className="mt-5">{parts.date}</div>
              <div className="mt-6 font-semibold text-[14px]">{parts.title}</div>
              <div className="mt-1">Re: <span className="bg-[#fff4c2] rounded px-0.5">{parts.re || '[Project title]'}</span></div>
              <p className="mt-4 mb-0">{parts.body[0].replace(/ of our .*$/, ' of our ')}<span className="bg-[#fff4c2] rounded px-0.5">{f.programme.trim().replace(/\.$/, '') || '[Insurance programme]'}</span>.</p>
              <p className="mt-3 mb-0">{parts.body[1]}</p>
              <p className="mt-3 mb-0">{parts.closing}</p>
              <div className="mt-14 w-[200px] border-t border-[#0f1412] pt-1">
                <div>{parts.name}</div><div>{parts.designation}</div><div className="font-semibold">{parts.company}</div>
              </div>
            </div>
          </div>
        )}
        {!f && error && <p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
