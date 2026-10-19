'use client'

// Workday: the client's administrator creates an integration user; HR enters it here. The server
// reads Get_Workers once and discards the password.
import { useState } from 'react'
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { Gate } from '@/components/hr-connect/frame'
import { api, ApiError, useLink } from '@/components/hr-connect/link-context'
import { PeopleFound } from '@/components/hr-connect/read-table'

export default function WorkdayPage() {
  const { token, setDraft } = useLink()
  const [form, setForm] = useState({ tenantHost: '', tenant: '', username: '', password: '' })
  const [read, setRead] = useState<HrRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const ready = form.tenantHost.trim() && form.tenant.trim() && form.username.trim() && form.password

  async function fetchList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setRead(null)
    try {
      const r = await api<{ read: HrRead }>(token, '/workday', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setForm(f => ({ ...f, password: '' }))
      setRead(r.read)
      setDraft({ source: r.read.source, source_meta: r.read.meta, employees: r.read.employees, dependants: r.read.dependants, employee_count: r.read.employees.length, dependant_count: r.read.dependants.length, status: 'draft', updated_at: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Workday could not be read. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Gate>
      {() => (
        <>
          <h1>Connect Workday</h1>
          <p className="hrc-sub">Your Workday administrator creates an integration user for this request. Trade Risk Solutions reads the worker list with it once. The password is not stored, not logged and not shown again.</p>

          <h2>Instructions for your Workday administrator</h2>
          <div className="hrc-note">
            <ol>
              <li>Create an Integration System User (ISU), for example <code>ISU_TRS_Benefits</code>, with a password that does not expire, and exempt it from password rules as your policy allows.</li>
              <li>Create an Integration System Security Group and add the user to it.</li>
              <li>Grant the group <b>Get</b> access on the domains <b>Worker Data: Public Worker Reports</b> and <b>Person Data: Date of Birth</b>. No Put or Modify access is needed.</li>
              <li>Activate pending security policy changes.</li>
              <li>Give HR the tenant host (for example <code>wd3.myworkday.com</code>), the tenant id, the user name and the password. Disable the user once the list has been read.</li>
            </ol>
          </div>

          <h2>What is read</h2>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Read</b><span>Worker id, legal name, date of birth, gender, hire date, active status, position title, citizenship or visa where present</span></div>
            <div className="hrc-fact"><b>Not read</b><span>Compensation, national id, addresses, contact details, documents, time off</span></div>
          </div>

          <form onSubmit={fetchList}>
            <div className="hrc-field" style={{ marginTop: 18 }}>
              <label htmlFor="wd-host">Tenant host</label>
              <input id="wd-host" type="text" autoComplete="off" value={form.tenantHost} onChange={set('tenantHost')} placeholder="wd3.myworkday.com" />
            </div>
            <div className="hrc-field">
              <label htmlFor="wd-tenant">Tenant id</label>
              <input id="wd-tenant" type="text" autoComplete="off" value={form.tenant} onChange={set('tenant')} placeholder="yourcompany" />
            </div>
            <div className="hrc-field">
              <label htmlFor="wd-user">Integration user</label>
              <input id="wd-user" type="text" autoComplete="off" value={form.username} onChange={set('username')} placeholder="ISU_TRS_Benefits" />
            </div>
            <div className="hrc-field">
              <label htmlFor="wd-pass">Password</label>
              <input id="wd-pass" type="password" autoComplete="off" value={form.password} onChange={set('password')} />
            </div>
            {error && <p className="hrc-err">{error}</p>}
            <div className="hrc-row" style={{ marginTop: 10 }}>
              <button type="submit" className="hrc-btn p" disabled={busy || !ready}>{busy ? 'Reading Workday.' : 'Fetch the worker list'}</button>
              <Link href={`/connect/${token}/upload`} className="hrc-btn">Upload a file instead</Link>
            </div>
          </form>

          {read && <PeopleFound read={read} token={token} source="Workday tenant" />}
        </>
      )}
    </Gate>
  )
}
