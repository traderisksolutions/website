'use client'

// Deel: an admin creates an API token with people:read; HR pastes it. Read once, discarded.
import { useState } from 'react'
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { PeopleFound } from '@/components/hr-connect/read-table'

export default function DeelPage() {
  const { token, setDraft } = useLink()
  const [secret, setSecret] = useState('')
  const [read, setRead] = useState<HrRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function fetchList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setRead(null)
    try {
      const r = await api<{ read: HrRead }>(token, '/deel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: secret.trim() }) })
      setSecret('')
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Deel could not be read. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Connect Deel</h1>
          <p className="hrc-sub">Paste a Deel API token. Trade Risk Solutions reads the employee list with it once. The token is not stored, not logged and not shown again.</p>

          <h2>Where the token is</h2>
          <div className="hrc-note">
            A Deel administrator creates it.
            <ol>
              <li>In Deel, open Apps &amp; Integrations, then Developer, then Access tokens.</li>
              <li>Create an organisation token with the people:read scope only.</li>
              <li>Paste it below. You can revoke the token in Deel as soon as the list has been read.</li>
            </ol>
          </div>

          <h2>What is read</h2>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Read</b><span>Name, date of birth, gender, job title, start date, hiring status, country</span></div>
            <div className="hrc-fact"><b>Not read</b><span>Salary, contracts, bank details, identity numbers, addresses, contact details</span></div>
            <div className="hrc-fact"><b>Check</b><span>Contractors and people working outside Singapore are marked; remove them on the next page if they are not to be insured.</span></div>
            <div className="hrc-fact"><b>Added by you</b><span>Spouse and children, on the next page.</span></div>
          </div>

          <form onSubmit={fetchList}>
            <div className="hrc-field" style={{ marginTop: 18 }}>
              <label htmlFor="deel-token">Deel API token</label>
              <input id="deel-token" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste the token" />
            </div>
            {error && <p className="hrc-err">{error}</p>}
            <div className="hrc-row" style={{ marginTop: 10 }}>
              <button type="submit" className="hrc-btn p" disabled={busy || secret.trim().length < 10}>{busy ? 'Reading Deel.' : 'Fetch the employee list'}</button>
              <Link href={`/connect/${token}/upload`} className="hrc-btn">Upload a file instead</Link>
            </div>
          </form>

          {read && <PeopleFound read={read} token={token} source="Deel account" />}
        </>
      )}
    </Gate>
  )
}
