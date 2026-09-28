'use client'

import Link from 'next/link'

/**
 * How the dashboard fits together, drawn in plain boxes: the five doors a company comes in
 * through, the company at the centre, and every page as a different view of the same
 * companies. No diagram library — the layout is a grid, the arrows are text, so it renders
 * anywhere and reads on a phone.
 */

const INK = '#202124'
const MUTED = '#5f6368'

const DOORS: { title: string; how: string; href: string }[] = [
  { title: 'All Inbox', how: 'A new external domain becomes a company the first time it is seen, classified client / insurer / partner, flagged Unconfirmed until a person confirms the name.', href: '/engagement' },
  { title: 'Debit note approve', how: 'The extracted client name is matched against existing companies; a new one is created when nothing matches.', href: '/debit-notes/new' },
  { title: 'Pricing Matrix quote', how: 'The company picker searches or creates the client the census belongs to.', href: '/pricing-matrix/quote/new' },
  { title: 'Sales · Move to Sales', how: 'A lead becomes a company at Prospect, keeping its campaign and thread.', href: '/pipeline' },
  { title: 'Add company', how: 'The button on Home and Companies.', href: '/companies' },
]
const VIEWS: { title: string; what: string; href: string; field: string }[] = [
  { title: 'Home', what: 'The companies the team pinned, with their to-dos.', href: '/', field: '#F1F3F4' },
  { title: 'Companies', what: 'Every client and insurer: stage, threads, LTV, next renewal, owner.', href: '/companies', field: '#EAF2FF' },
  { title: 'All Inbox', what: 'Threads filed under the company; the context rail beside each message.', href: '/engagement', field: '#F1EEFF' },
  { title: 'Nexus', what: 'Cases across the company\'s threads and files; Opus judges, Gemini reads.', href: '/nexus', field: '#F1EEFF' },
  { title: 'Debit Notes', what: 'Policies and premiums; the policy end date is the renewal.', href: '/debit-notes', field: '#FFF0E7' },
  { title: 'Pricing Matrix', what: 'Quotes priced on the company\'s census against each insurer.', href: '/pricing-matrix', field: '#FFF6D8' },
  { title: 'Calendar', what: 'Renewals, RFQ chasers and case deadlines, by date.', href: '/calendar', field: '#EAF6EC' },
  { title: 'Finance', what: 'Receipts recorded against debit notes.', href: '/finance', field: '#FFF0E7' },
]

export function WorkflowDiagram() {
  return (
    <div className="flex flex-col gap-6" style={{ color: INK }}>
      <p className="m-0 text-[14.5px] max-w-[72ch]" style={{ color: MUTED }}>The company is the primary key. A thread, policy, debit note, quote, to-do or calendar date belongs to a company; every page is a different view of the same companies.</p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,220px)_56px_minmax(0,1fr)] items-center">
        {/* Doors */}
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Where a company is created</p>
          {DOORS.map(d => (
            <Link key={d.title} href={d.href} className="rounded-[12px] px-4 py-3 no-underline hover:bg-[#e8eaed]" style={{ background: '#F1F3F4', color: INK }}>
              <span className="block text-[14px] font-medium">{d.title}</span>
              <span className="block text-[12.5px] mt-0.5" style={{ color: MUTED }}>{d.how}</span>
            </Link>
          ))}
        </div>
        <div className="hidden md:flex justify-center text-[22px]" style={{ color: '#9aa0a6' }} aria-hidden>→</div>
        {/* Company */}
        <div className="rounded-[20px] px-5 py-6 text-center" style={{ background: INK, color: '#fff' }}>
          <p className="m-0 text-[12px] uppercase tracking-[0.08em]" style={{ color: '#bdc1c6' }}>Primary key</p>
          <p className="m-0 mt-1 text-[22px] font-medium">Company</p>
          <p className="m-0 mt-2 text-[12.5px]" style={{ color: '#bdc1c6' }}>client or insurer · owner · stage · domains · pinned · to-dos</p>
        </div>
        <div className="hidden md:flex justify-center text-[22px]" style={{ color: '#9aa0a6' }} aria-hidden>→</div>
        {/* Views */}
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>Every page is a view of it</p>
          {VIEWS.map(v => (
            <Link key={v.title} href={v.href} className="rounded-[12px] px-4 py-2.5 no-underline transition-transform motion-safe:hover:-translate-y-0.5" style={{ background: v.field, color: INK }}>
              <span className="block text-[14px] font-medium">{v.title}</span>
              <span className="block text-[12.5px] mt-0.5" style={{ color: '#3c4043' }}>{v.what}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-[16px] px-5 py-4" style={{ border: '1px solid #e8eaed' }}>
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>The loop</p>
        <ol className="m-0 mt-2 pl-5 text-[14px] leading-relaxed flex flex-col gap-1" style={{ color: '#3c4043' }}>
          <li>Mail arrives and files under a company — created on first sight of a new domain.</li>
          <li>The team pins the company on Home and writes to-dos.</li>
          <li>A quote is priced in Pricing Matrix on the client's census.</li>
          <li>The bound policy becomes a debit note; its end date becomes the Calendar renewal.</li>
          <li>Receipts are recorded in Finance against the debit note.</li>
          <li>The renewal email arrives and files under the same company. Back to 2.</li>
        </ol>
      </div>
    </div>
  )
}
