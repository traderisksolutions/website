'use client'

// SimplePay: paste an API key; the server reads the employee list once and discards the key.
// A key with access to several companies asks HR which company to read.
import { useState } from 'react'
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { PeopleFound } from '@/components/hr-connect/read-table'

type Company = { id: string; name: string }

export default function SimplePayPage() {
  const { token, setDraft } = useLink()
  const [apiKey, setApiKey] = useState('')
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [companyId, setCompanyId] = useState('')
  const [read, setRead] = useState<HrRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function fetchList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setRead(null)
    try {
      const r = await api<{ read: HrRead }>(token, '/simplepay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: apiKey.trim(), companyId: companyId || null }) })
      setApiKey(''); setCompanies(null); setCompanyId('')
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.body.companies)) {
        setCompanies(err.body.companies as Company[])
        setError('')
      } else {
        setError(err instanceof ApiError ? err.message : 'SimplePay could not be read. Try again.')
      }
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Connect SimplePay</h1>
          <p className="hrc-sub">Paste an API key from your SimplePay account. Trade Risk Solutions reads the employee list with it once. The key is not stored, not logged and not shown again.</p>

          <h2>Where the key is</h2>
          <div className="hrc-note">
            A SimplePay owner or administrator creates it.
            <ol>
              <li>Sign in to SimplePay as an owner or administrator.</li>
              <li>Open Settings, then Users, then API Users, and choose Add.</li>
              <li>Give it access to the company being quoted and copy the key.</li>
              <li>Paste it below. You can delete the API user in SimplePay as soon as the list has been read.</li>
            </ol>
          </div>

          <h2>What is read</h2>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Read</b><span>Name, date of birth, job title, appointment date, end of service</span></div>
            <div className="hrc-fact"><b>Not read</b><span>Salary, payslips, bank details, NRIC or passport numbers, tax numbers, addresses, contact details</span></div>
            <div className="hrc-fact"><b>Added by you</b><span>Spouse and children, on the next page. SimplePay does not keep dependants.</span></div>
          </div>

          <form onSubmit={fetchList}>
            <div className="hrc-field" style={{ marginTop: 18 }}>
              <label htmlFor="simplepay-key">SimplePay API key</label>
              <input id="simplepay-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste the key" />
            </div>
            {companies && (
              <div className="hrc-field">
                <label htmlFor="simplepay-company">Company</label>
                <select id="simplepay-company" value={companyId} onChange={e => setCompanyId(e.target.value)}>
                  <option value="">Choose the company being quoted</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                </select>
              </div>
            )}
            {error && <p className="hrc-err">{error}</p>}
            <div className="hrc-row" style={{ marginTop: 10 }}>
              <button type="submit" className="hrc-btn p" disabled={busy || apiKey.trim().length < 10 || (!!companies && !companyId)}>{busy ? 'Reading SimplePay.' : 'Fetch the employee list'}</button>
              <Link href={`/connect/${token}/upload`} className="hrc-btn">Upload a file instead</Link>
            </div>
          </form>

          {read && <PeopleFound read={read} token={token} source="SimplePay account" />}
        </>
      )}
    </Gate>
  )
}
