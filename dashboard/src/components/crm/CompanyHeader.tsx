'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Pencil, Sparkles, Globe, User } from 'lucide-react'
import { StageBadge, Btn, Chip } from './primitives'
import { EditCompanyDialog } from './dialogs'
import { StatCard } from '@/components/stat-card'
import { fmtMoney, fmtDate, fmtRelative, todaySGT } from '@/lib/crm/format'
import { STAGES, STAGE_LABEL, type Company, type Stage, type PaymentSummary } from '@/lib/crm/types'

export function CompanyHeader({ company, summary, paymentSummary, needsReply, openActions, onCompany, onStage, onAskAi }: {
  company: Company
  summary: { contactCount: number; activePolicies: number; nextRenewalDate: string | null; openDebitNoteCount: number; overdueCount: number }
  paymentSummary: PaymentSummary
  needsReply: number
  openActions: number
  onCompany: (c: Company) => void
  onStage: (s: Stage) => Promise<void>
  onAskAi: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [changing, setChanging] = useState(false)
  const sgd = paymentSummary.byCurrency.find(m => m.currency === 'SGD') ?? paymentSummary.byCurrency[0]

  return (
    <div className="mb-5">
      <Link href="/companies" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/70 hover:text-muted-foreground no-underline mb-2"><ArrowLeft size={12} /> Companies</Link>

      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Building2 size={18} className="text-muted-foreground/70" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-bold tracking-tight text-foreground m-0 leading-tight break-words">{company.name}</h1>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <StageBadge stage={company.stage} />
            <label className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <span className="sr-only">Change stage</span>
              <select
                value={company.stage}
                disabled={changing}
                onChange={async e => { setChanging(true); try { await onStage(e.target.value as Stage) } finally { setChanging(false) } }}
                className="h-6 rounded-[6px] border border-[--border-subtle] bg-transparent text-[11.5px] px-1.5 text-muted-foreground cursor-pointer"
                aria-label="Change stage"
              >
                {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </label>
            {company.stage_changed_at && <span className="text-[11px] text-muted-foreground/70">since {fmtDate(company.stage_changed_at)}</span>}
            <span className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1"><User size={11} /> {company.owner_email ? company.owner_email.split('@')[0] : 'No owner'}</span>
            {company.domains.map(d => <Chip key={d} tone="neutral" title="Emails from this domain are filed here"><Globe size={10} /> {d}</Chip>)}
            {company.industry && <span className="text-[11.5px] text-muted-foreground">{company.industry}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Btn level="secondary" onClick={() => setEditing(true)}><Pencil size={12} /> Edit</Btn>
          <Btn level="primary" onClick={onAskAi}><Sparkles size={12} /> Ask about this company</Btn>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Outstanding" value={sgd ? fmtMoney(sgd.outstanding, sgd.currency, { compact: true }) : '—'} sublabel={paymentSummary.byCurrency.length > 1 ? `+ ${paymentSummary.byCurrency.length - 1} more currenc${paymentSummary.byCurrency.length === 2 ? 'y' : 'ies'}` : `${summary.openDebitNoteCount} open debit note${summary.openDebitNoteCount === 1 ? '' : 's'}`} />
        <StatCard label="Overdue" value={summary.overdueCount} sublabel={sgd && sgd.overdue > 0 ? fmtMoney(sgd.overdue, sgd.currency, { compact: true }) : 'Nothing overdue'} accent={summary.overdueCount > 0 ? 'red' : undefined} />
        <StatCard label="Awaiting reply" value={needsReply} sublabel="Emails from them, unanswered" accent={needsReply > 0 ? 'amber' : undefined} />
        {(() => {
          const d = summary.nextRenewalDate
          const past = !!d && d < todaySGT()
          return (
            <StatCard
              label={past ? 'Policy ended' : 'Next renewal'}
              value={d ? fmtRelative(d) : '—'}
              sublabel={d ? (past ? 'Renewal not recorded yet' : fmtDate(d)) : `${summary.activePolicies} active polic${summary.activePolicies === 1 ? 'y' : 'ies'}`}
              accent={past ? 'amber' : undefined}
            />
          )
        })()}
        <StatCard label="Open actions" value={openActions} sublabel={`${summary.contactCount} contact${summary.contactCount === 1 ? '' : 's'} on file`} className="hidden lg:block" />
      </div>

      <EditCompanyDialog open={editing} onClose={() => setEditing(false)} company={company} onSaved={onCompany} />
    </div>
  )
}
