'use client'

/**
 * The Policy page's Letter tab: the company's broker appointment letter, where it stands, and the
 * three things a person does with it — create it (AppointmentLetterDialog: editor beside the
 * printed letter, PDF and Word filed in Drive, draft to the client), upload the signed copy, open it.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Spinner, btnClass } from '@/components/crm/primitives'
import { AppointmentLetterDialog } from '@/components/letters/AppointmentLetterDialog'
import { fmtDate, fmtDateTime } from '@/lib/format'
import type { LetterStatus } from '@/lib/letters/appointment'

const WORD: Record<LetterStatus['state'], [string, string]> = {
  signed: ['Signed', 'text-trs-pos'], sent: ['Sent, not signed', 'text-trs-warn'], needed: ['Needed', 'text-trs-warn'], none: ['Not on file', 'text-trs-muted'],
}

export function AppointmentLetterPanel({ companyId, companyName, placementId }: { companyId: string; companyName: string; placementId?: string | null }) {
  const [status, setStatus] = useState<LetterStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/letters/appointment?company_id=${companyId}${placementId ? `&placement_id=${placementId}` : ''}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error ?? 'Could not load the letter'); else { setError(null); setStatus(j.status) }
  }, [companyId, placementId])
  useEffect(() => { void load() }, [load])

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const form = new FormData()
      form.set('file', file); form.set('doc_type', 'broker_appointment')
      const res = await fetch(`/api/companies/${companyId}/data-room`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Upload failed (${res.status})`)
      setNote(`✓ Signed letter filed · ${fmtDateTime(new Date().toISOString())}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false) }
  }

  if (!status && !error) return <Spinner label="Loading the appointment letter" />
  const [word, tone] = status ? WORD[status.state] : ['—', 'text-trs-muted']
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-8 border border-trs-line-2 bg-white">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-trs-line px-4 py-1.5">
        <h3 className="m-0 text-14 font-semibold text-trs-ink">Appointment letter · {companyName}</h3>
        <span className="flex flex-wrap items-center gap-2">
          {status?.url && <a href={status.url} target="_blank" rel="noreferrer" className={`${btnClass('secondary', 'xs')} no-underline`}>Open letter ↗</a>}
          {status?.state === 'sent' && (
            <label className="inline-flex cursor-pointer">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="hidden" aria-label="Upload signed letter" onChange={e => void upload(e.target.files)} />
              <span className={btnClass('secondary', 'xs')}>{uploading ? 'Uploading…' : 'Upload signed letter'}</span>
            </label>
          )}
          <Btn size="xs" level={status?.state === 'signed' ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>{status?.state === 'signed' ? 'New letter' : 'Create letter'}</Btn>
        </span>
      </header>
      <table className="trs-table">
        <thead><tr><th className="px-4">Status</th><th className="px-3">Date</th></tr></thead>
        <tbody><tr>
          <td className={`px-4 font-medium ${tone}`}>{word}</td>
          <td className="px-3">{status?.at ? fmtDate(status.at) : '—'}</td>
        </tr></tbody>
      </table>
      {(note || error) && <div className={`border-t border-trs-line px-4 py-2 text-12.5 ${error ? 'text-trs-neg' : 'text-trs-pos'}`} role="status">{error ?? note}</div>}
      <AppointmentLetterDialog open={open} onClose={() => setOpen(false)} companyId={companyId} placementId={placementId ?? null}
        onDone={() => { setNote(`✓ Letter filed in Drive · ${fmtDateTime(new Date().toISOString())}`); void load() }} />
    </section>
  )
}
