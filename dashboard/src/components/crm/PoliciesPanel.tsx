'use client'

import { SectionCard, Chip, Empty } from './primitives'
import { fmtDate, fmtRelative, fmtMoney, todaySGT, daysBetween } from '@/lib/crm/format'

export type Policy = {
  id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null
  broker?: string | null; currency: string | null; premium?: number | null
  start_date: string | null; end_date: string | null; status: string | null
}

export function PoliciesPanel({ policies }: { policies: Policy[] }) {
  const today = todaySGT()
  const active = policies.filter(p => p.status === 'active')
  const past = policies.filter(p => p.status !== 'active')

  const table = (rows: Policy[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] min-w-[560px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-[--border-subtle]">
            <th className="text-left pr-3 py-1.5 font-semibold">Cover</th>
            <th className="text-left pr-3 py-1.5 font-semibold">Insurer</th>
            <th className="text-left pr-3 py-1.5 font-semibold">Policy no.</th>
            <th className="text-left pr-3 py-1.5 font-semibold">Period</th>
            <th className="text-right pr-3 py-1.5 font-semibold">Premium</th>
            <th className="text-left py-1.5 font-semibold">Renews</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const days = p.end_date ? daysBetween(today, p.end_date) : null
            return (
              <tr key={p.id} className="border-b border-[--border-subtle] last:border-b-0">
                <td className="pr-3 py-2 font-medium">{p.class_of_insurance ?? '—'}</td>
                <td className="pr-3 py-2 text-muted-foreground"><span className="block truncate max-w-[190px]">{p.insurer ?? '—'}</span></td>
                <td className="pr-3 py-2 font-mono text-[11.5px] text-muted-foreground">{p.policy_number ?? '—'}</td>
                <td className="pr-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</td>
                <td className="pr-3 py-2 text-right tabular-nums">{p.premium != null ? fmtMoney(p.premium, p.currency ?? 'SGD') : '—'}</td>
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
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <SectionCard title="Active policies" description="Placed through TRS. Created from debit-note imports.">
        {active.length === 0 ? <Empty compact>No active policies on file.</Empty> : table(active)}
      </SectionCard>
      {past.length > 0 && <SectionCard title="Past policies">{table(past)}</SectionCard>}
    </>
  )
}
