import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { UrlFilters } from '@/components/ui/url-filters'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Chip } from '@/components/crm/primitives'
import { sbTry, enc } from '@/lib/crm/db'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { LIFECYCLE_LABEL, type PolicyLifecycle } from '@/lib/policies/types'
import { todaySGT } from '@/lib/sgt-time'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; company_id: string | null; insurer: string | null; class_of_insurance: string | null; product_line: string | null
  policy_number: string | null; start_date: string | null; end_date: string | null; lifecycle: PolicyLifecycle
  companies: { company_name: string | null } | null
}
type View = 'in_force' | 'renewing' | 'quoting' | 'ended' | 'all'
const VIEWS: { value: View; label: string }[] = [
  { value: 'in_force', label: 'In force' }, { value: 'renewing', label: 'Renewing in 60 days' },
  { value: 'quoting', label: 'Quoting' }, { value: 'ended', label: 'Ended' }, { value: 'all', label: 'All' },
]
const LIMIT = 500

/** Every policy across clients. Ranked by expiry, soonest first. */
export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const sp = await searchParams
  const view = (VIEWS.some(v => v.value === sp.view) ? sp.view : 'in_force') as View
  const q = (sp.q ?? '').trim()
  const today = todaySGT()
  const in60 = new Date(Date.parse(today) + 60 * 86_400_000).toISOString().slice(0, 10)
  const filter: Record<View, string> = {
    in_force: 'lifecycle=in.(bound,live,renewal_due)',
    renewing: `lifecycle=in.(bound,live,renewal_due)&end_date=gte.${today}&end_date=lte.${in60}`,
    quoting: 'lifecycle=in.(quoting,presented)',
    ended: 'lifecycle=in.(lapsed,declined,closed)',
    all: '',
  }
  // A search matches the policy number, the insurer, or the client's name.
  const like = enc(`*${q.replace(/[(),*]/g, ' ')}*`)
  const matched = q ? await sbTry<{ id: string }[]>(`companies?company_name=ilike.${like}&select=id&limit=200`, []) : []
  const search = q ? `&or=(policy_number.ilike.${like},insurer.ilike.${like}${matched.length ? `,company_id.in.(${matched.map(c => c.id).join(',')})` : ''})` : ''
  const rows = await sbTry<Row[]>(
    `policies?select=id,company_id,insurer,class_of_insurance,product_line,policy_number,start_date,end_date,lifecycle,companies(company_name)&${filter[view]}${search}&order=end_date.asc.nullslast&limit=${LIMIT}`,
    [],
  )
  const expired = rows.filter(r => (r.lifecycle === 'live' || r.lifecycle === 'bound') && r.end_date && r.end_date < today).length

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0">
      <PageHeader title="Policies" meta={<>{rows.length}{rows.length === LIMIT ? '+' : ''} {rows.length === 1 ? 'policy' : 'policies'}{expired > 0 && view === 'in_force' ? ` · ${expired} past expiry` : ''}</>}>
        <UrlFilters<View> param="view" value={view} options={VIEWS} query={q} placeholder="Client, insurer or policy no." />
      </PageHeader>
      <Register label="Policies" minWidth={860}>
        <RegisterHead>
          <RegisterTh first>Client</RegisterTh>
          <RegisterTh>Class</RegisterTh>
          <RegisterTh>Insurer</RegisterTh>
          <RegisterTh>Policy no.</RegisterTh>
          <RegisterTh>Period</RegisterTh>
          <RegisterTh last>Status</RegisterTh>
        </RegisterHead>
        <tbody>
          {rows.length === 0 && <RegisterEmpty colSpan={6}>No policies in this view</RegisterEmpty>}
          {rows.map(r => {
            const lapsedLive = (r.lifecycle === 'live' || r.lifecycle === 'bound') && !!r.end_date && r.end_date < today
            return (
              <RegisterRow key={r.id}>
                <RegisterCell first primary={r.company_id
                  ? <Link href={`/companies/${r.company_id}?tab=policies`} className="text-trs-ink no-underline hover:underline">{r.companies?.company_name ?? 'Unnamed client'}</Link>
                  : 'No client'} />
                <RegisterCell>{r.class_of_insurance ?? (r.product_line ? productLineLabel(r.product_line) : '—')}</RegisterCell>
                <RegisterCell>{r.insurer ?? '—'}</RegisterCell>
                <RegisterCell className="font-mono text-[12.5px]"><Link href={`/policies/${r.id}`} className="text-trs-ink no-underline hover:underline">{r.policy_number ?? 'Ledger'}</Link></RegisterCell>
                <RegisterCell className="tabular-nums">{r.start_date || r.end_date ? `${r.start_date ? fmtDate(r.start_date) : '?'} – ${r.end_date ? fmtDate(r.end_date) : '?'}` : '—'}</RegisterCell>
                <RegisterCell last>
                  {lapsedLive ? <Chip tone="red">Past expiry</Chip> : <Chip tone={r.lifecycle === 'renewal_due' ? 'amber' : r.lifecycle === 'live' || r.lifecycle === 'bound' ? 'green' : 'neutral'}>{LIFECYCLE_LABEL[r.lifecycle] ?? r.lifecycle}</Chip>}
                </RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>
    </div>
  )
}
