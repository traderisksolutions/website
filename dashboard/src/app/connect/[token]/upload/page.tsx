'use client'

// Upload: drop the Excel or CSV HR already has; see the columns matched and the people read.
import { useRef, useState } from 'react'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { ColumnsFound, PeopleFound } from '@/components/hr-connect/read-table'

export default function UploadPage() {
  const { token, setDraft } = useLink()
  const [read, setRead] = useState<HrRead | null>(null)
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function send(file: File) {
    setBusy(true); setError(''); setRead(null); setFilename(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api<{ read: HrRead }>(token, '/upload', { method: 'POST', body: fd })
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The file could not be read. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Upload the employee list</h1>
          <p className="hrc-sub">Excel or CSV, any layout. Columns are matched by their headings. Dates are read day-first. Salary, NRIC, passport, address and contact columns are discarded on upload and never stored.</p>
          <div
            className={`hrc-drop${over ? ' over' : ''}`}
            role="button" tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click() }}
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void send(f) }}
          >
            <b>{busy ? 'Reading the file.' : 'Drop the file here, or choose it'}</b>
            Excel (.xlsx) or CSV · up to 2,000 people{filename ? ` · ${filename}${read ? ' read' : ''}` : ''}
            <input ref={input} type="file" accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = '' }} />
          </div>
          {error && <p className="hrc-err">{error}</p>}
          {read && (
            <>
              <ColumnsFound meta={read.meta} />
              <PeopleFound read={read} token={token} source="file" />
              <div className="hrc-row" style={{ marginTop: 10 }}>
                <button type="button" className="hrc-btn" onClick={() => input.current?.click()}>Choose another file</button>
              </div>
            </>
          )}
        </>
      )}
    </Gate>
  )
}
