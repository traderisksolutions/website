'use client'

// HR Connect: what a reader found, shown before HR reviews it. Columns matched, people found,
// rows skipped. Neutral chips; a missing value is said in words, never coloured.
import Link from 'next/link'
import type { HrRead } from '@/lib/hr/types'
import { fmtDob, plural } from './format'

const FIELD_LABEL: Record<string, string> = {
  name: 'Name', dob: 'Date of birth', gender: 'Gender', category: 'Category or grade', workPass: 'Work pass',
  hireDate: 'Hire date', status: 'Status', employeeId: 'Employee id', relationship: 'Relationship', employeeName: 'Employee', employeeKey: 'Employee',
}

export function ColumnsFound({ meta }: { meta: Record<string, unknown> }) {
  const columns = meta.columns && typeof meta.columns === 'object' ? meta.columns as Record<string, string> : null
  const ignored = Array.isArray(meta.ignored) ? meta.ignored as string[] : []
  if (!columns && ignored.length === 0) return null
  return (
    <>
      <h2>Columns found</h2>
      <div className="hrc-scroll">
        <table>
          <thead><tr><th>Your column</th><th>Read as</th><th></th></tr></thead>
          <tbody>
            {columns && Object.entries(columns).map(([field, header]) => (
              <tr key={field}><td>{String(header)}</td><td>{FIELD_LABEL[field] ?? field}</td><td><span className="chip">Matched</span></td></tr>
            ))}
            {ignored.map(h => (
              <tr key={`ig-${h}`}><td>{h}</td><td className="m">Not read</td><td><span className="chip">Ignored, not needed</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function PeopleFound({ read, token, source }: { read: HrRead; token: string; source: string }) {
  const active = read.employees.filter(e => e.status !== 'inactive').length
  const inactive = read.employees.length - active
  return (
    <>
      <h2>People found: {plural(read.employees.length, 'employee')}{read.dependants.length ? `, ${plural(read.dependants.length, 'dependant')}` : ''}</h2>
      {inactive > 0 && <p className="hrc-sub" style={{ marginBottom: 12 }}>{plural(inactive, 'person is', 'people are')} not active and will be excluded from the quotation. They stay on the list so the rule is visible.</p>}
      <div className="hrc-scroll">
        <table>
          <thead><tr><th>Name</th><th>Date of birth</th><th>Gender</th><th>Category</th><th>Work pass</th><th>Status</th></tr></thead>
          <tbody>
            {read.employees.map(e => (
              <tr key={e.key}>
                <td>{e.name}</td>
                <td className={e.dob ? '' : 'm'}>{e.dob ? fmtDob(e.dob) : 'missing'}</td>
                <td className={e.gender ? '' : 'm'}>{e.gender ?? '–'}</td>
                <td className={e.category ? '' : 'm'}>{e.category ?? '–'}</td>
                <td className={e.workPass ? '' : 'm'}>{e.workPass ?? '–'}</td>
                <td>{e.status === 'inactive' ? <span className="chip">Excluded, not active</span> : e.issues.length ? <span className="chip">{e.issues[0]}</span> : <span className="chip">Complete</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {read.skipped.length > 0 && (
        <>
          <h2>Rows not read: {read.skipped.length}</h2>
          <div className="hrc-scroll">
            <table>
              <thead><tr><th>Row</th><th>Reason</th></tr></thead>
              <tbody>{read.skipped.map(s => <tr key={s.key}><td>{s.key}</td><td>{s.reason}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      <p className="hrc-sub" style={{ marginTop: 14 }}>
        {read.dependants.length ? 'Dependants were read from the same source. You can add or correct them on the next page.' : `Dependants are not in this ${source}. You can add them on the next page.`}
      </p>
      <div className="hrc-row" style={{ marginTop: 0 }}>
        <Link href={`/connect/${token}/review`} className="hrc-btn p">Continue to review</Link>
      </div>
    </>
  )
}
