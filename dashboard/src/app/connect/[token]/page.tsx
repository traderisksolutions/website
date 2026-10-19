'use client'

// Landing: what is asked, why, what is not collected, three ways to provide the list.
import Link from 'next/link'
import { Gate, countLine } from '@/components/hr-connect/frame'
import { useLink } from '@/components/hr-connect/link-context'
import { fmtLong, fmtStamp, shortCompany } from '@/components/hr-connect/format'

export default function LandingPage() {
  const { token } = useLink()
  return (
    <Gate>
      {(link, draft) => (
        <>
          <h1>Employee list for {shortCompany(link.company_name)}&rsquo;s group benefits quotation</h1>
          <p className="hrc-sub">
            Requested by Trade Risk Solutions{link.requested_by ? ` on behalf of ${link.requested_by}` : ''}.
            {link.effective_date ? ` Cover starts ${fmtLong(link.effective_date)}.` : ''} Please provide the list in whichever way is easiest for you.
            {' '}The link is open until {fmtLong(link.expires_at.slice(0, 10))}.
          </p>
          <div className="hrc-facts">
            <div className="hrc-fact"><b>Per employee</b><span>Name, date of birth, gender, category or grade, work pass, hire date</span></div>
            <div className="hrc-fact"><b>Per dependant</b><span>Name, relationship, date of birth</span></div>
            <div className="hrc-fact"><b>Not collected</b><span>Salary, NRIC or passport numbers, addresses, medical information</span></div>
            <div className="hrc-fact"><b>Used for</b><span>Quotations from insurers for this policy only. Deleted on request.</span></div>
          </div>

          {draft && (
            <>
              <h2>Saved draft</h2>
              <div className="hrc-opt">
                <div><b>{countLine(draft.employee_count, draft.dependant_count)}</b><span>Saved at {fmtStamp(draft.updated_at)}. Review, add dependants and submit, or start again with another source below.</span></div>
                <Link href={`/connect/${token}/review`} className="hrc-btn p">Continue to review</Link>
              </div>
            </>
          )}

          <h2>Ways to provide the list</h2>
          <div className="hrc-opts">
            <div className="hrc-opt">
              <div><b>Upload your own Excel or CSV</b><span>Any layout. The columns are matched by their headings and you see what was read before anything is submitted.</span></div>
              <Link href={`/connect/${token}/upload`} className={`hrc-btn${draft ? '' : ' p'}`}>Upload a file</Link>
            </div>
            <div className="hrc-opt">
              <div><b>Connect Talenox</b><span>Paste an API token from your Talenox account. It is used once to read the employee list and is not stored.</span></div>
              <Link href={`/connect/${token}/talenox`} className="hrc-btn">Connect Talenox</Link>
            </div>
            <div className="hrc-opt">
              <div><b>Connect Workday</b><span>Your Workday administrator creates an integration user with read access to worker data. The password is used once and is not stored.</span></div>
              <Link href={`/connect/${token}/workday`} className="hrc-btn">Connect Workday</Link>
            </div>
          </div>
        </>
      )}
    </Gate>
  )
}
