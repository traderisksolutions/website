'use client'

// Review: the list grouped by employee, dependants added under each, dates of birth fixed inline,
// consent, then Save and finish later or Submit.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CONSENT_TEXT, type HrDependant, type HrEmployee } from '@/lib/hr/types'
import { toIsoDate } from '@/lib/dates/dob'
import { Gate, countLine } from '@/components/hr-connect/frame'
import { api, ApiError, useLink, type PublicDraft } from '@/components/hr-connect/link-context'
import { fmtDob, fmtLong, plural, shortCompany } from '@/components/hr-connect/format'
import type { PublicLink } from '@/lib/hr/public'

type NewDep = { name: string; relationship: 'spouse' | 'child'; dob: string }

function DobCell({ value, onChange }: { value: string | null; onChange: (iso: string | null, raw: string) => void }) {
  const [raw, setRaw] = useState('')
  if (value) return <>{fmtDob(value)}</>
  return (
    <input
      className="cell" type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={raw} aria-label="Date of birth"
      onChange={e => setRaw(e.target.value)}
      onBlur={() => { const iso = toIsoDate(raw); if (iso) onChange(iso, raw) }}
      onKeyDown={e => { if (e.key === 'Enter') { const iso = toIsoDate(raw); if (iso) onChange(iso, raw) } }}
    />
  )
}

function ReviewBody({ link, draft }: { link: PublicLink; draft: PublicDraft }) {
  const { token, refresh } = useLink()
  const router = useRouter()
  const [employees, setEmployees] = useState<HrEmployee[]>(draft.employees)
  const [dependants, setDependants] = useState<HrDependant[]>(draft.dependants)
  const [adding, setAdding] = useState<Record<string, NewDep>>({})
  const [name, setName] = useState(link.recipient_name)
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'submit'>('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setEmployees(draft.employees); setDependants(draft.dependants) }, [draft])

  const missing = useMemo(() => employees.filter(e => !e.dob).length + dependants.filter(d => !d.dob).length, [employees, dependants])
  const consentBody = CONSENT_TEXT(link.company_name, link.effective_date ? fmtLong(link.effective_date) : null)
  const [consentFacts, consentDeclaration] = useMemo(() => {
    const i = consentBody.indexOf(' I am authorised')
    return i > 0 ? [consentBody.slice(0, i), consentBody.slice(i + 1)] : [consentBody, '']
  }, [consentBody])

  const fixEmployeeDob = (key: string, iso: string) => setEmployees(list => list.map(e => (e.key === key ? { ...e, dob: iso, issues: e.issues.filter(s => !/date of birth/i.test(s)) } : e)))
  const fixDependantDob = (key: string, iso: string) => setDependants(list => list.map(d => (d.key === key ? { ...d, dob: iso, issues: d.issues.filter(s => !/date of birth/i.test(s)) } : d)))
  const removeDependant = (key: string) => setDependants(list => list.filter(d => d.key !== key))

  function addDependant(employeeKey: string) {
    const n = adding[employeeKey]
    if (!n || !n.name.trim()) return
    const dob = toIsoDate(n.dob)
    const dep: HrDependant = { key: `d-${employeeKey}-${Date.now()}`, employeeKey, name: n.name.trim(), relationship: n.relationship, dob, gender: null, issues: dob ? [] : ['Date of birth missing'] }
    setDependants(list => [...list, dep])
    setAdding(a => { const { [employeeKey]: _drop, ...rest } = a; return rest })
  }

  async function save(): Promise<boolean> {
    setError(''); setMsg('')
    try {
      await api(token, '/draft', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employees, dependants }) })
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The draft could not be saved. Try again.')
      return false
    }
  }

  async function onSave() {
    setBusy('save')
    if (await save()) setMsg('Saved. You can close this page and come back with the same link until it expires.')
    setBusy('')
  }

  async function onSubmit() {
    if (!consent) { setError('Tick the consent statement to submit.'); return }
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter your name and email so the receipt reaches you.'); return }
    setBusy('submit')
    if (!(await save())) { setBusy(''); return }
    try {
      await api(token, '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), email: email.trim(), consent: true }) })
      await refresh()
      router.push(`/connect/${token}/done`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The list could not be submitted. Try again.')
      setBusy('')
    }
  }

  return (
    <>
      <h1>Review the list</h1>
      <p className="hrc-sub">
        {countLine(employees.length, dependants.length)}.
        {missing > 0 ? ` ${plural(missing, 'date of birth is', 'dates of birth are')} missing. You can fill them in here, or submit now and send them later.` : ' Every date of birth is present.'}
      </p>

      <div className="hrc-scroll">
        <table>
          <thead><tr><th>Name</th><th>Relationship</th><th>Date of birth</th><th>Category</th><th>Work pass</th><th></th></tr></thead>
          <tbody>
            {employees.map(e => (
              <EmployeeRows
                key={e.key} employee={e} dependants={dependants.filter(d => d.employeeKey === e.key)}
                adding={adding[e.key]}
                onStartAdd={() => setAdding(a => ({ ...a, [e.key]: { name: '', relationship: 'spouse', dob: '' } }))}
                onChangeAdd={n => setAdding(a => ({ ...a, [e.key]: n }))}
                onCancelAdd={() => setAdding(a => { const { [e.key]: _drop, ...rest } = a; return rest })}
                onAdd={() => addDependant(e.key)}
                onFixEmployeeDob={iso => fixEmployeeDob(e.key, iso)}
                onFixDependantDob={fixDependantDob}
                onRemoveDependant={removeDependant}
              />
            ))}
          </tbody>
        </table>
      </div>

      <h2>Submitted by</h2>
      <div className="hrc-field"><label htmlFor="rv-name">Your name</label><input id="rv-name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></div>
      <div className="hrc-field"><label htmlFor="rv-email">Your email, for the receipt</label><input id="rv-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>

      <div className="hrc-consent">
        <b style={{ fontWeight: 500 }}>Before you submit</b><br />
        {consentFacts}
        <label>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>{consentDeclaration || `I am authorised by ${shortCompany(link.company_name)} to provide this list.`}</span>
        </label>
      </div>

      {error && <p className="hrc-err">{error}</p>}
      {msg && <p className="hrc-sub" style={{ margin: '10px 0 0' }}>{msg}</p>}
      <div className="hrc-row">
        <button type="button" className="hrc-btn" disabled={!!busy} onClick={onSave}>{busy === 'save' ? 'Saving.' : 'Save and finish later'}</button>
        <button type="button" className="hrc-btn p" disabled={!!busy || employees.length === 0} onClick={onSubmit}>{busy === 'submit' ? 'Submitting.' : 'Submit the list'}</button>
      </div>
    </>
  )
}

function EmployeeRows(props: {
  employee: HrEmployee
  dependants: HrDependant[]
  adding?: NewDep
  onStartAdd: () => void
  onChangeAdd: (n: NewDep) => void
  onCancelAdd: () => void
  onAdd: () => void
  onFixEmployeeDob: (iso: string) => void
  onFixDependantDob: (key: string, iso: string) => void
  onRemoveDependant: (key: string) => void
}) {
  const { employee: e, dependants, adding } = props
  const state = (dob: string | null, status: string, issues: string[]) =>
    status === 'inactive' ? 'Excluded, not active' : !dob ? 'Add date of birth' : issues.length ? issues[0] : 'Complete'
  return (
    <>
      <tr>
        <td><b style={{ fontWeight: 500 }}>{e.name}</b></td>
        <td>Employee</td>
        <td className={e.dob ? '' : 'm'}><DobCell value={e.dob} onChange={iso => iso && props.onFixEmployeeDob(iso)} /></td>
        <td className={e.category ? '' : 'm'}>{e.category ?? '–'}</td>
        <td className={e.workPass ? '' : 'm'}>{e.workPass ?? '–'}</td>
        <td><span className="chip">{state(e.dob, e.status, e.issues)}</span></td>
      </tr>
      {dependants.map(d => (
        <tr key={d.key}>
          <td className="dep">{d.name}</td>
          <td>{d.relationship === 'spouse' ? 'Spouse' : 'Child'}</td>
          <td className={d.dob ? '' : 'm'}><DobCell value={d.dob} onChange={iso => iso && props.onFixDependantDob(d.key, iso)} /></td>
          <td className="m">–</td>
          <td className="m">–</td>
          <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="chip">{d.dob ? 'Complete' : 'Add date of birth'}</span>
            <button type="button" className="hrc-btn sm" onClick={() => props.onRemoveDependant(d.key)}>Remove</button>
          </td>
        </tr>
      ))}
      {adding ? (
        <tr>
          <td className="dep"><input className="cell" type="text" placeholder="Dependant name" value={adding.name} onChange={ev => props.onChangeAdd({ ...adding, name: ev.target.value })} aria-label="Dependant name" /></td>
          <td>
            <select className="cell" value={adding.relationship} onChange={ev => props.onChangeAdd({ ...adding, relationship: ev.target.value as 'spouse' | 'child' })} aria-label="Relationship">
              <option value="spouse">Spouse</option>
              <option value="child">Child</option>
            </select>
          </td>
          <td><input className="cell" type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={adding.dob} onChange={ev => props.onChangeAdd({ ...adding, dob: ev.target.value })} aria-label="Dependant date of birth" /></td>
          <td className="m">–</td>
          <td className="m">–</td>
          <td style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="hrc-btn sm p" disabled={!adding.name.trim()} onClick={props.onAdd}>Add</button>
            <button type="button" className="hrc-btn sm" onClick={props.onCancelAdd}>Cancel</button>
          </td>
        </tr>
      ) : (
        <tr>
          <td className="dep" colSpan={6}><button type="button" className="hrc-btn sm" onClick={props.onStartAdd}>+ Add a dependant</button></td>
        </tr>
      )}
    </>
  )
}

export default function ReviewPage() {
  const { token } = useLink()
  return (
    <Gate>
      {(link, draft) => draft ? <ReviewBody link={link} draft={draft} /> : (
        <>
          <h1>Review the list</h1>
          <p className="hrc-sub">Nothing has been provided yet. Upload a file or connect your HR system first.</p>
          <div className="hrc-row"><Link href={`/connect/${token}`} className="hrc-btn p">Ways to provide the list</Link></div>
        </>
      )}
    </Gate>
  )
}
