'use client'

// BambooHR: HR enters the company name and an API key from their own login. Read once, discarded.
import { useState } from 'react'
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { PeopleFound } from '@/components/hr-connect/read-table'

export default function BambooHRPage() {
  const { token, setDraft } = useLink()
  const [company, setCompany] = useState('')
  const [secret, setSecret] = useState('')
  const [read, setRead] = useState<HrRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function fetchList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setRead(null)
    try {
      const r = await api<{ read: HrRead }>(token, '/bamboohr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: company.trim(), key: secret.trim() }) })
      setSecret('')
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'BambooHR could not be read. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Connect BambooHR</h1>
          <p className="hrc-sub">Enter your BambooHR company name and an API key. Trade Risk Solutions reads the employee list with it once. The key is not stored, not logged and not shown again.</p>

          <h2>Where the key is</h2>
          <div className="hrc-note">
            Use a BambooHR login that can see every employee, such as an administrator.
            <ol>
              <li>Sign in to BambooHR. The company name is the part of the address before .bamboohr.com.</li>
              <li>Open the menu under your name, choose API Keys, then Add New Key.</li>
              <li>Paste the key below. You can delete it in BambooHR as soon as the list has been read.</li>
            </ol>
          </div>

          <h2>What is read</h2>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Read</b><span>Name, date of birth, gender, job title, department, hire date, status; spouse and children when your login manages benefits</span></div>
            <div className="hrc-fact"><b>Not read</b><span>Salary, bank details, identity numbers, addresses, contact details</span></div>
          </div>

          <form onSubmit={fetchList}>
            <div className="hrc-field" style={{ marginTop: 18 }}>
              <label htmlFor="bamboo-company">Company name</label>
              <input id="bamboo-company" type="text" autoComplete="off" value={company} onChange={e => setCompany(e.target.value)} placeholder="yourcompany" />
            </div>
            <div className="hrc-field">
              <label htmlFor="bamboo-key">API key</label>
              <input id="bamboo-key" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste the key" />
            </div>
            {error && <p className="hrc-err">{error}</p>}
            <div className="hrc-row" style={{ marginTop: 10 }}>
              <button type="submit" className="hrc-btn p" disabled={busy || !company.trim() || secret.trim().length < 10}>{busy ? 'Reading BambooHR.' : 'Fetch the employee list'}</button>
              <Link href={`/connect/${token}/upload`} className="hrc-btn">Upload a file instead</Link>
            </div>
          </form>

          {read && <PeopleFound read={read} token={token} source="BambooHR account" />}
        </>
      )}
    </Gate>
  )
}
