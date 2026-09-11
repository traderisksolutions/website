'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react'
import { Btn } from './primitives'
import { EditCompanyDialog } from './dialogs'
import { STAGES, STAGE_LABEL, type Company, type Stage } from '@/lib/crm/types'

/** Name, stage and the facts that decide what to do next — all on one line. No stat boxes. */
export function CompanyHeader({ company, statusLine, onCompany, onStage, onAskAi }: {
  company: Company
  statusLine: string
  onCompany: (c: Company) => void
  onStage: (s: Stage) => Promise<void>
  onAskAi: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [changing, setChanging] = useState(false)

  return (
    <div className="mb-4">
      <Link href="/companies" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/70 hover:text-muted-foreground no-underline mb-2"><ArrowLeft size={12} /> Companies</Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold tracking-tight text-foreground m-0 leading-tight break-words">{company.name}</h1>

          {/* One line, not two. Stage and identity on the left, then the facts that decide what
              to do next. Anything that was only metadata (industry, stage date) moved to Edit. */}
          <div className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-[12.5px]">
            <select
              value={company.stage}
              disabled={changing}
              onChange={async e => { setChanging(true); try { await onStage(e.target.value as Stage) } finally { setChanging(false) } }}
              aria-label="Stage"
              className="h-6 rounded-[6px] border border-[--border-subtle] bg-transparent text-[12px] font-medium px-1.5 text-foreground cursor-pointer"
            >
              {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <span className="text-muted-foreground">{company.owner_email ? company.owner_email.split('@')[0] : 'No owner'}</span>
            {company.domains.length > 0 && <><span aria-hidden className="text-muted-foreground/50">·</span><span className="text-muted-foreground">{company.domains[0]}</span></>}
            {statusLine && <><span aria-hidden className="text-muted-foreground/50">·</span><span className="text-foreground/90">{statusLine}</span></>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Btn level="secondary" onClick={() => setEditing(true)}><Pencil size={12} /> Edit</Btn>
          <Btn level="primary" onClick={onAskAi}><Sparkles size={12} /> Ask AI</Btn>
        </div>
      </div>

      <EditCompanyDialog open={editing} onClose={() => setEditing(false)} company={company} onSaved={onCompany} />
    </div>
  )
}
