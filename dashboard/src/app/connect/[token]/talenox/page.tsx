'use client'

// Talenox: paste an API token; the server reads the employee list once and discards the token.
import { useState } from 'react'
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { PeopleFound } from '@/components/hr-connect/read-table'

export default function TalenoxPage() {
  const { token, setDraft } = useLink()
  const [apiToken, setApiToken] = useState('')
  const [read, setRead] = useState<HrRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function fetchList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setRead(null)
    try {
      const r = await api<{ read: HrRead }>(token, '/talenox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: apiToken.trim() }) })
      setApiToken('')
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Talenox could not be read. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Connect Talenox</h1>
          <p className="hrc-sub">Paste an API token from your Talenox account. Trade Risk Solutions reads the employee list with it once. The token is not stored, not logged and not shown again.</p>

          <h2>Where the token is</h2>
          <div className="hrc-note">
            A Talenox account administrator creates it.
            <ol>
              <li>Sign in to Talenox as an administrator.</li>
              <li>Open the profile menu and choose the API or integrations settings.</li>
              <li>Create a token with read access to employees and copy it. Talenox&rsquo;s help pages describe the exact steps for your plan.</li>
              <li>Paste it below. You can delete the token in Talenox as soon as the list has been read.</li>
            </ol>
          </div>

          <h2>What is read</h2>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Read</b><span>Name, date of birth, gender, job title or department, immigration status, hire date, employment status</span></div>
            <div className="hrc-fact"><b>Not read</b><span>Salary, bank details, NRIC or passport numbers, addresses, contact details, payroll</span></div>
          </div>

          <form onSubmit={fetchList}>
            <div className="hrc-field" style={{ marginTop: 18 }}>
              <label htmlFor="talenox-token">Talenox API token</label>
              <input id="talenox-token" type="password" autoComplete="off" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Paste the token" />
            </div>
            {error && <p className="hrc-err">{error}</p>}
            <div className="hrc-row" style={{ marginTop: 10 }}>
              <button type="submit" className="hrc-btn p" disabled={busy || apiToken.trim().length < 10}>{busy ? 'Reading Talenox.' : 'Fetch the employee list'}</button>
              <Link href={`/connect/${token}/upload`} className="hrc-btn">Upload a file instead</Link>
            </div>
          </form>

          {read && <PeopleFound read={read} token={token} source="Talenox account" />}
        </>
      )}
    </Gate>
  )
}
