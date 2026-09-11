'use client'

import { SectionCard, Chip, Empty } from './primitives'
import { fmtDate, fmtRelative, fmtMoney, todaySGT, daysBetween } from '@/lib/crm/format'

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

/**
 * What this client has bought and what they are worth.
 *
 * The premium column reads from the debit notes, not from `policies.premium`, which no import
 * has ever populated — that is why every row used to show a dash.
 */
export function PoliciesPanel({ policies, value }: { policies: Policy[]; value?: CompanyValue }) {
  const today = todaySGT()
  const active = policies.filter(p => p.status === 'active')
  const past = policies.filter(p => p.status !== 'active')

  const table = (rows: Policy[]) => {
    const subtotal = rows.reduce((sum, p) => sum + Number(p.premium ?? 0), 0)
    const currency = rows.find(p => p.currency)?.currency ?? 'SGD'
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[680px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-[--border-subtle]">
              <th className="text-left pr-3 py-1.5 font-semibold">Cover</th>
              <th className="text-left pr-3 py-1.5 font-semibold">Insurer</th>
              <th className="text-left pr-3 py-1.5 font-semibold">Policy no.</th>
              <th className="text-left pr-3 py-1.5 font-semibold">Period</th>
              <th className="text-right pr-3 py-1.5 font-semibold">Premium</th>
              <th className="text-right pr-3 py-1.5 font-semibold">Commission</th>
              <th className="text-left py-1.5 font-semibold">Renews</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const days = p.end_date ? daysBetween(today, p.end_date) : null
              return (
                <tr key={p.id} className="border-b border-[--border-subtle] last:border-b-0">
                  <td className="pr-3 py-2 font-medium">{p.class_of_insurance ?? '—'}</td>
                  <td className="pr-3 py-2 text-muted-foreground"><span className="block truncate max-w-[180px]">{p.insurer ?? '—'}</span></td>
                  <td className="pr-3 py-2 font-mono text-[11.5px] text-muted-foreground">{p.policy_number ?? '—'}</td>
                  <td className="pr-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</td>
                  <td className="pr-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {p.premium != null
                      ? <>
                          <span className="font-semibold">{fmtMoney(p.premium, p.currency ?? 'SGD')}</span>
                          {p.premiumSource === 'debit_notes' && (p.debitNoteCount ?? 0) > 1 && (
                            <span className="block text-[10.5px] text-muted-foreground">{p.debitNoteCount} debit notes</span>
                          )}
                        </>
                      : <span className="text-muted-foreground" title="Nothing has been billed against this policy yet">Not billed</span>}
                  </td>
                  <td className="pr-3 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {p.commission ? fmtMoney(p.commission, p.currency ?? 'SGD') : '—'}
                  </td>
                  <td className="py-2">
                    {p.end_date && p.status === 'active'
                      ? days !== null && days < 0
                        ? <Chip tone="amber">Ended {fmtRelative(p.end_date)}</Chip>
                        : days !== null && days <= 60 ? <Chip tone="amber">{fmtRelative(p.end_date)}</Chip> : <span className="text-muted-foreground">{fmtRelative(p.end_date)}</span>
                      : <Chip tone="neutral" className="capitalize">{p.status ?? 'unknown'}</Chip>}
                  </td>
                </tr>
              )
            })}
            {subtotal > 0 && rows.length > 1 && (
              <tr className="border-t border-[--border-subtle]">
                <td colSpan={4} className="pr-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Subtotal</td>
                <td className="pr-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(subtotal, currency)}</td>
                <td className="pr-3 py-2 text-right tabular-nums text-muted-foreground">
                  {fmtMoney(rows.reduce((sum, p) => sum + Number(p.commission ?? 0), 0), currency)}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      {value && value.byCurrency.length > 0 && <ValueBox value={value} />}

      <SectionCard title="Active cover" description="What this client currently has in force, placed through TRS.">
        {active.length === 0 ? <Empty compact>No active policies on file.</Empty> : table(active)}
      </SectionCard>
      {past.length > 0 && <SectionCard title="Expired and cancelled">{table(past)}</SectionCard>}

      {value && value.byCurrency.length > 0 && policies.every(p => p.premium == null) && (
        <p className="text-[11.5px] text-muted-foreground mt-2">
          Premiums come from the debit notes raised against each policy. Notes that are not linked to a
          policy still count toward customer value above.
        </p>
      )}
    </>
  )
}

/** The number a relationship manager wants first: what this client is worth. */
function ValueBox({ value }: { value: CompanyValue }) {
  const years = value.firstBilled
    ? Math.max(1, Math.round((Date.now() - new Date(value.firstBilled).getTime()) / 31_557_600_000 * 10) / 10)
    : null

  return (
    <div className="mb-4 rounded-lg border border-[--border-subtle] bg-card p-5">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold m-0 mb-3">Customer value</p>

      <div className="flex flex-wrap gap-x-10 gap-y-4">
        {value.byCurrency.map(v => (
          <div key={v.currency} className="min-w-[190px]">
            <p className="m-0 leading-none">
              <span className="text-[13px] font-semibold text-muted-foreground align-top mr-1">{v.currency}</span>
              <span className="text-[32px] font-bold tracking-tight tabular-nums">
                {v.billed.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
            <p className="text-[12px] text-muted-foreground m-0 mt-1.5">
              Total premium billed across {v.notes} debit note{v.notes === 1 ? '' : 's'}
            </p>
            {v.commission > 0 && (
              <p className="text-[12.5px] m-0 mt-2">
                <span className="text-muted-foreground">TRS commission </span>
                <strong className="tabular-nums">{fmtMoney(v.commission, v.currency)}</strong>
                <span className="text-muted-foreground"> ({Math.round((v.commission / v.billed) * 100)}%)</span>
              </p>
            )}
          </div>
        ))}

        <div className="min-w-[150px] text-[12.5px] flex flex-col gap-1 justify-center">
          <p className="m-0"><span className="text-muted-foreground">Policies </span><strong className="tabular-nums">{value.policyCount}</strong><span className="text-muted-foreground">, {value.activePolicies} in force</span></p>
          {value.firstBilled && <p className="m-0"><span className="text-muted-foreground">Client since </span><strong>{fmtDate(value.firstBilled)}</strong>{years && years >= 1 && <span className="text-muted-foreground"> · {years} yr</span>}</p>}
          {value.lastBilled && <p className="m-0"><span className="text-muted-foreground">Last billed </span><strong>{fmtDate(value.lastBilled)}</strong></p>}
        </div>
      </div>
    </div>
  )
}
