'use client'

// HiBob: the Bob admin creates a service user; HR enters its ID and token. Read once, discarded.
import { useState } from 'react'
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { PeopleFound } from '@/components/hr-connect/read-table'

export default function HiBobPage() {
  const { token, setDraft } = useLink()
  const [userId, setUserId] = useState('')
  const [secret, setSecret] = useState('')
  const [read, setRead] = useState<HrRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function fetchList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setRead(null)
    try {
      const r = await api<{ read: HrRead }>(token, '/hibob', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceUserId: userId.trim(), token: secret.trim() }) })
      setSecret('')
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bob could not be read. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Connect HiBob</h1>
          <p className="hrc-sub">Enter a Bob service user ID and token. Trade Risk Solutions reads the employee list with them once. The token is not stored, not logged and not shown again.</p>

          <h2>Where the ID and token are</h2>
          <div className="hrc-note">
            A Bob administrator creates them.
            <ol>
              <li>In Bob, open Settings, then Integrations, then Service users, and create a service user.</li>
              <li>Copy the ID and the token. Bob shows the token only once.</li>
              <li>Add the service user to a permission group with View on people’s Basic info, Work and Personal fields, for all active employees.</li>
              <li>Enter both below. You can delete the service user in Bob as soon as the list has been read.</li>
            </ol>
          </div>

          <h2>What is read</h2>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Read</b><span>Name, date of birth, gender, job title, department, start date, employment status</span></div>
            <div className="hrc-fact"><b>Not read</b><span>Salary, bank details, identity numbers, addresses, contact details</span></div>
            <div className="hrc-fact"><b>Added by you</b><span>Spouse and children, on the next page.</span></div>
          </div>

          <form onSubmit={fetchList}>
            <div className="hrc-field" style={{ marginTop: 18 }}>
              <label htmlFor="hibob-id">Service user ID</label>
              <input id="hibob-id" type="text" autoComplete="off" value={userId} onChange={e => setUserId(e.target.value)} placeholder="SERVICE-12345" />
            </div>
            <div className="hrc-field">
              <label htmlFor="hibob-token">Token</label>
              <input id="hibob-token" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste the token" />
            </div>
            {error && <p className="hrc-err">{error}</p>}
            <div className="hrc-row" style={{ marginTop: 10 }}>
              <button type="submit" className="hrc-btn p" disabled={busy || !userId.trim() || secret.trim().length < 10}>{busy ? 'Reading Bob.' : 'Fetch the employee list'}</button>
              <Link href={`/connect/${token}/upload`} className="hrc-btn">Upload a file instead</Link>
            </div>
          </form>

          {read && <PeopleFound read={read} token={token} source="Bob account" />}
        </>
      )}
    </Gate>
  )
}
