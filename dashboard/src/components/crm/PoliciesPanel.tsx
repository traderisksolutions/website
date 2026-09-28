'use client'

import { looksLikeEndorsement, findMasterPolicy } from '@/lib/policies/endorsement'
import { SectionCard, Empty } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, fmtRelative, fmtMoney } from '@/lib/crm/format'

const INK = '#202124'
const MUTED = '#5f6368'

export type Policy = {
  id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null
  broker?: string | null; currency: string | null; premium?: number | null
  premiumSource?: 'policy' | 'debit_notes' | null
  commission?: number | null; debitNoteCount?: number
  start_date: string | null; end_date: string | null; status: string | null
}

export type CompanyValue = {
  byCurrency: { currency: string; billed: number; commission: number; notes: number }[]
  policyCount: number
  activePolicies: number
  firstBilled: string | null
  lastBilled: string | null
}

const STATUS_LABEL: Record<string, string> = { active: 'In force', expired: 'Expired', cancelled: 'Cancelled', lapsed: 'Lapsed', pending: 'Pending' }
const statusWords = (s: string | null) => STATUS_LABEL[s ?? ''] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown')

/**
 * What this client has bought and what they are worth.
 *
 * The premium column reads from the debit notes, not from `policies.premium`, which no import
 * has ever populated — that is why every row used to show a dash.
 */
export function PoliciesPanel({ policies, value }: { policies: Policy[]; value?: CompanyValue }) {
  const active = policies.filter(p => p.status === 'active')
  const past = policies.filter(p => p.status !== 'active')

  const table = (rows: Policy[], label: string) => {
    const subtotal = rows.reduce((sum, p) => sum + Number(p.premium ?? 0), 0)
    const commissionTotal = rows.reduce((sum, p) => sum + Number(p.commission ?? 0), 0)
    const currency = rows.find(p => p.currency)?.currency ?? 'SGD'
    return (
      <Register label={label} minWidth={880}>
        <RegisterHead>
          <RegisterTh first>Cover</RegisterTh>
          <RegisterTh>Policy no.</RegisterTh>
          <RegisterTh>Period</RegisterTh>
          <RegisterTh align="right">Premium</RegisterTh>
          <RegisterTh align="right">Commission</RegisterTh>
          <RegisterTh last align="right">Renewal</RegisterTh>
        </RegisterHead>
        <tbody>
          {rows.map(p => {
            // A mid-term endorsement amends its main policy: it says so, and its renewal is the main policy's.
            const master = looksLikeEndorsement(p) ? findMasterPolicy(p, policies) : null
            return (
            <RegisterRow key={p.id}>
              <RegisterCell first primary={p.class_of_insurance ?? 'Cover not recorded'} secondary={p.insurer ?? 'Insurer not recorded'} title={p.insurer ?? undefined} />
              <RegisterCell primary={p.policy_number ?? '—'} secondary={master ? `Amendment to ${master.policy_number ?? 'the main policy'}` : undefined} />
              <RegisterCell primary={`${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}`} />
              <RegisterCell align="right"
                primary={p.premium != null ? fmtMoney(p.premium, p.currency ?? 'SGD') : <span style={{ color: MUTED }}>Not billed</span>}
                secondary={p.premium != null && p.premiumSource === 'debit_notes' && (p.debitNoteCount ?? 0) > 1 ? `${p.debitNoteCount} debit notes` : undefined}
                title={p.premium == null ? 'Nothing has been billed against this policy yet' : undefined} />
              <RegisterCell align="right" primary={p.commission ? fmtMoney(p.commission, p.currency ?? 'SGD') : '—'} />
              <RegisterCell last align="right"
                primary={master ? fmtDate(master.end_date) : p.end_date ? fmtDate(p.end_date) : 'No end date'}
                secondary={master ? 'Follows the main policy' : p.end_date && p.status === 'active' ? fmtRelative(p.end_date) : statusWords(p.status)} />
            </RegisterRow>
            )
          })}
          {subtotal > 0 && rows.length > 1 && (
            <RegisterRow>
              <RegisterCell first colSpan={3}><span className="text-[13px]" style={{ color: MUTED }}>Subtotal</span></RegisterCell>
              <RegisterCell align="right"><span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{fmtMoney(subtotal, currency)}</span></RegisterCell>
              <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: MUTED }}>{fmtMoney(commissionTotal, currency)}</span></RegisterCell>
              <RegisterCell last />
            </RegisterRow>
          )}
        </tbody>
      </Register>
    )
  }

  return (
    <>
      {value && value.byCurrency.length > 0 && <ValueTiles value={value} />}

      <SectionCard title="Active cover">
        {active.length === 0 ? <Empty compact>No active policies on file.</Empty> : table(active, 'Active policies')}
      </SectionCard>
      {past.length > 0 && <SectionCard title="Expired and cancelled">{table(past, 'Expired and cancelled policies')}</SectionCard>}

      {value && value.byCurrency.length > 0 && policies.every(p => p.premium == null) && (
        <p className="text-[13px] mt-3 m-0" style={{ color: MUTED }}>
          Premiums come from the debit notes raised against each policy. Notes that are not linked to a
          policy still count toward the total billed above.
        </p>
      )}
    </>
  )
}

/** The number a relationship manager wants first: what this client is worth. Grey tiles, no chart. */
function ValueTiles({ value }: { value: CompanyValue }) {
  const years = value.firstBilled
    ? Math.max(1, Math.round((Date.now() - new Date(value.firstBilled).getTime()) / 31_557_600_000 * 10) / 10)
    : null

  return (
    <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {value.byCurrency.map(v => (
        <div key={v.currency} className="rounded-[16px] p-5" style={{ background: '#f1f3f4' }}>
          <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Total billed ({v.currency})</p>
          <p className="m-0 mt-1.5 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>
            {v.billed.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="m-0 mt-2 text-[12.5px]" style={{ color: MUTED }}>
            {v.notes} debit note{v.notes === 1 ? '' : 's'}
            {v.commission > 0 && <> · commission {fmtMoney(v.commission, v.currency)} ({Math.round((v.commission / v.billed) * 100)}%)</>}
          </p>
        </div>
      ))}

      <div className="rounded-[16px] p-5" style={{ background: '#f1f3f4' }}>
        <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Policies</p>
        <p className="m-0 mt-1.5 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>{value.policyCount}</p>
        <p className="m-0 mt-2 text-[12.5px]" style={{ color: MUTED }}>
          {value.activePolicies} in force
          {value.firstBilled && <> · client since {fmtDate(value.firstBilled)}{years && years >= 1 ? ` (${years} yr)` : ''}</>}
          {value.lastBilled && <> · last billed {fmtDate(value.lastBilled)}</>}
        </p>
      </div>
    </div>
  )
}
