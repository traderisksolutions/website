'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, Sparkles } from 'lucide-react'
import { Btn, Chip } from './primitives'
import { EditCompanyDialog } from './dialogs'
import { BoardChip } from '@/components/board/BoardChip'
import { PersonTag } from '@/components/board/TodoEditor'
import type { StaffMember } from '@/lib/crm/staff'
import { STAGES, STAGE_LABEL, type Company, type Stage } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const NO_STAFF = new Map<string, StaffMember>()

/** Strip the money segment: the header names the relationship, the Finance tab carries the figures. */
function withoutMoney(line: string): string {
  return line.split(' · ').filter(p => !/outstanding$/i.test(p.trim())).join(' · ')
}

/** Name, stage, owner and domain on one line, then one muted status line. No stat boxes. */
export function CompanyHeader({ company, statusLine, onCompany, onStage, onAskAi }: {
  company: Company
  statusLine: string
  onCompany: (c: Company) => void
  onStage: (s: Stage) => Promise<void>
  onAskAi: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [changing, setChanging] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function confirm() {
    setConfirming(true)
    try {
      const res = await fetch(`/api/companies/${company.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) })
      const d = await res.json()
      if (res.ok && d.company) onCompany(d.company)
    } finally { setConfirming(false) }
  }

  const status = withoutMoney(statusLine)

  return (
    <div className="mb-8">
      <Link href="/companies" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Companies</Link>

      <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08] break-words" style={{ color: INK }}>{company.name}</h1>

          <div className="mt-3 flex items-center gap-x-3 gap-y-2 flex-wrap text-[14px]" style={{ color: MUTED }}>
            <select
              value={company.stage}
              disabled={changing}
              onChange={async e => { setChanging(true); try { await onStage(e.target.value as Stage) } finally { setChanging(false) } }}
              aria-label="Stage"
              className="h-8 rounded-[8px] border bg-white pl-2.5 pr-7 text-[13.5px] font-medium cursor-pointer outline-none focus:border-[#202124] disabled:opacity-50"
              style={{ borderColor: '#dadce0', color: INK }}
            >
              {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            {company.owner_email
              ? <PersonTag email={company.owner_email} staff={NO_STAFF} size="md" />
              : <span>No owner</span>}
            {company.domains.length > 0 && <span>{company.domains[0]}</span>}
            {company.confirmed_at === null && (
              <span className="inline-flex items-center gap-2">
                <Chip title="Mail filing created this record from an email domain. Check the name, then confirm it.">Unconfirmed</Chip>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={confirming}
                  className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4 text-[13.5px] disabled:opacity-50"
                  style={{ color: INK }}
                >
                  {confirming ? 'Saving…' : 'Confirm name'}
                </button>
              </span>
            )}
          </div>
          {status && <p className="m-0 mt-2 text-[14px]" style={{ color: MUTED }}>{status}</p>}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <BoardChip companyId={company.id} />
          <Btn level="secondary" className="h-12 px-5 rounded-[12px] text-[15px]" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Btn>
          <Btn level="primary" className="h-12 px-6 rounded-[12px] text-[15px]" onClick={onAskAi}><Sparkles size={14} /> Ask AI</Btn>
        </div>
      </div>

      <EditCompanyDialog open={editing} onClose={() => setEditing(false)} company={company} onSaved={onCompany} />
    </div>
  )
}
