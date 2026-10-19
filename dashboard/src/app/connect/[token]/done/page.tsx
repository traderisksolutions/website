'use client'

// Done: the receipt on screen. A submitted link answers 410 with the counts, which is what this
// page shows; any other state falls through to the gate.
import { useEffect } from 'react'
import { Closed, Gate, OPS_EMAIL, countLine } from '@/components/hr-connect/frame'
import { useLink } from '@/components/hr-connect/link-context'
import { fmtStamp } from '@/components/hr-connect/format'

export default function DonePage() {
  const { state, refresh } = useLink()

  // Arriving from the review page, the provider still holds the open link; ask again.
  useEffect(() => { if (state.kind === 'ok') void refresh() }, [state.kind, refresh])

  if (state.kind === 'closed') {
    const { link, reason, submission } = state.info
    if (reason !== 'submitted') return <Closed link={link} reason={reason} />
    return (
      <div className="hrc-done">
        <div className="hrc-tick" aria-hidden>✓</div>
        <h1 style={{ fontSize: 24 }}>Received. Thank you{submission?.submitted_by_name ? `, ${submission.submitted_by_name}` : ''}.</h1>
        <p className="hrc-sub">
          {submission ? `${countLine(submission.employee_count, submission.dependant_count)} for reference ${link.reference} were sent to Trade Risk Solutions${submission.consent_at ? ` at ${fmtStamp(submission.consent_at)}` : ''}.` : `The list for reference ${link.reference} was sent to Trade Risk Solutions.`}
          {' '}A copy of this confirmation has been emailed to you. Trade Risk Solutions will be in touch with the quotations.
        </p>
        <p className="hrc-sub">To change anything after submitting, write to <a href={`mailto:${OPS_EMAIL}?subject=${encodeURIComponent(`Ref ${link.reference}`)}`}>{OPS_EMAIL}</a> quoting the reference.</p>
      </div>
    )
  }
  if (state.kind === 'ok') return <p className="hrc-sub">Loading.</p>
  return <Gate>{() => null}</Gate>
}
