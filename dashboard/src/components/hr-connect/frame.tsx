'use client'

// HR Connect: the page frame (wordmark bar, body, footer) and the gate that shows loading,
// not-found, closed and migration-pending states before a page renders its own content.
import Link from 'next/link'
import type { PublicLink } from '@/lib/hr/public'
import { fmtLong, fmtStamp, plural } from './format'
import { useLink, type PublicDraft } from './link-context'

export const OPS_EMAIL = 'operations@trade-risksol.com'
const PLACEHOLDER_PHONE = '[office number]'
const PLACEHOLDER_ADDRESS = '[registered address]'

export function Frame({ children }: { children: React.ReactNode }) {
  const { state, token } = useLink()
  const link = state.kind === 'ok' ? state.link : state.kind === 'closed' ? state.info.link : null
  return (
    <div className="hrc">
      <header className="hrc-bar">
        <Link href={`/connect/${token}`} className="hrc-wm">TRADE RISK SOLUTIONS</Link>
        {link ? <span>Reference {link.reference} · {link.company_name}</span> : <span />}
      </header>
      <main className="hrc-in">{children}</main>
      <footer className="hrc-foot">
        Trade Risk Solutions Pte Ltd · <a href={`mailto:${OPS_EMAIL}`}>{OPS_EMAIL}</a> · +65 {PLACEHOLDER_PHONE} · {PLACEHOLDER_ADDRESS} · Personal data protection policy
      </footer>
    </div>
  )
}

export function Closed({ link, reason }: { link: PublicLink; reason: 'expired' | 'closed' | 'submitted' }) {
  const line = reason === 'expired'
    ? `This link expired on ${fmtLong(link.expires_at.slice(0, 10))}.`
    : reason === 'closed'
      ? 'This link has been closed by Trade Risk Solutions.'
      : 'The list for this reference has already been submitted. The link closed on submission.'
  return (
    <>
      <h1>Link no longer open</h1>
      <p className="hrc-sub">{line}</p>
      <p>To receive a new link, or to change a list already sent, write to <a href={`mailto:${OPS_EMAIL}?subject=${encodeURIComponent(`Ref ${link.reference}`)}`}>{OPS_EMAIL}</a> quoting reference {link.reference}.</p>
    </>
  )
}

/** Renders `children(link, draft)` once the link is open; otherwise the state line. */
export function Gate({ children }: { children: (link: PublicLink, draft: PublicDraft | null) => React.ReactNode }) {
  const { state } = useLink()
  switch (state.kind) {
    case 'loading': return <p className="hrc-sub">Loading.</p>
    case 'notfound': return (
      <>
        <h1>Link not recognised</h1>
        <p className="hrc-sub">Check that the whole address from the email was copied. If the problem continues, write to <a href={`mailto:${OPS_EMAIL}`}>{OPS_EMAIL}</a>.</p>
      </>
    )
    case 'closed': return <Closed link={state.info.link} reason={state.info.reason} />
    case 'pending': return <p className="hrc-sub">Migration 20261019_hr_connect is not applied yet.</p>
    case 'error': return <p className="hrc-sub">{state.message}</p>
    case 'ok': return <>{children(state.link, state.submission)}</>
  }
}

/** One line on the counts in a read: "6 employees and 2 dependants". */
export const countLine = (employees: number, dependants: number) => `${plural(employees, 'employee')} and ${plural(dependants, 'dependant')}`

export { fmtStamp }
