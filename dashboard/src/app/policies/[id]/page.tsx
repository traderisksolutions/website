import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Chip } from '@/components/crm/primitives'
import { fmtAmount } from '@/components/policies/types'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { getPolicyLedger, getRenewalPack, type LedgerLine, type PeriodFigures } from '@/lib/policies/ledger'
import { PolicyTabs, RenewalAdviceButton } from './controls'

export const dynamic = 'force-dynamic'

type Tab = 'ledger' | 'renewal'
const KIND_WORD: Record<LedgerLine['kind'], string> = { premium: 'Premium', endorsement: 'Endorsement', credit: 'Credit', insurer_note: 'Insurer note', claim: 'Claim', movement: 'Movement' }
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)
const n = (v: number | null | undefined) => (v == null ? '—' : String(v))

/** One policy: its ledger, and the renewal pack drawn from it. */
export default async function PolicyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const tab: Tab = sp.tab === 'renewal' ? 'renewal' : 'ledger'
  const ledger = await getPolicyLedger(id)
  if (!ledger) notFound()
  const { policy, lines } = ledger
  const pack = tab === 'renewal' ? await getRenewalPack(id) : null
  const ccy = policy.currency
  const title = `${policy.class ?? (policy.product_line ? productLineLabel(policy.product_line) : 'Policy')} · ${policy.insurer ?? 'No insurer'}`
  const last = lines[lines.length - 1]

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0">
      <PageHeader
        title={title}
        meta={<>
          {policy.company_id ? <Link href={`/companies/${policy.company_id}?tab=policies`} className="text-trs-ink no-underline hover:underline">{policy.company_name ?? 'Client'}</Link> : 'No client'}
          {' · '}<span className="font-mono">{policy.policy_number ?? 'no number'}</span>
          {' · '}{policy.start_date ? fmtDate(policy.start_date) : '?'} – {policy.end_date ? fmtDate(policy.end_date) : '?'}
          {' · '}{lines.length} {lines.length === 1 ? 'line' : 'lines'}{last ? ` · net ${fmtAmount(last.running_net, ccy)}` : ''}
        </>}
        actions={tab === 'renewal' ? <RenewalAdviceButton policyId={policy.id} /> : undefined}
      >
        <PolicyTabs value={tab} />
      </PageHeader>

      {tab === 'ledger' && (
        <Register label="Policy ledger" minWidth={960}>
          <RegisterHead>
            <RegisterTh first>Date</RegisterTh>
            <RegisterTh>Line</RegisterTh>
            <RegisterTh>Kind</RegisterTh>
            <RegisterTh align="right">Insurer billed</RegisterTh>
            <RegisterTh align="right" hint="What TRS billed the client, GST included where the insurer charged it">TRS billed</RegisterTh>
            <RegisterTh align="right">GST</RegisterTh>
            <RegisterTh align="right">Claimed</RegisterTh>
            <RegisterTh align="right">Claim paid</RegisterTh>
            <RegisterTh align="right">Net to date</RegisterTh>
            <RegisterTh last>Source</RegisterTh>
          </RegisterHead>
          <tbody>
            {lines.length === 0 && <RegisterEmpty colSpan={10}>No debit notes, insurer notes, claims or movements on this policy</RegisterEmpty>}
            {lines.map(l => (
              <RegisterRow key={`${l.source.table}:${l.source.id}`}>
                <RegisterCell first className="tabular-nums" identityWidth={120}>{l.date ? fmtDate(l.date) : '—'}</RegisterCell>
                <RegisterCell nowrap={false}>{l.label}{l.needs_review ? <> <Chip tone="amber">Check</Chip></> : null}</RegisterCell>
                <RegisterCell>{KIND_WORD[l.kind]}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{l.insurer_amount == null ? '—' : fmtAmount(l.insurer_amount, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{l.trs_amount == null ? '—' : fmtAmount(l.trs_amount, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{l.gst == null ? '—' : fmtAmount(l.gst, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{l.claim_claimed == null ? '—' : fmtAmount(l.claim_claimed, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{l.claim_paid == null ? '—' : fmtAmount(l.claim_paid, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(l.running_net, ccy)}</RegisterCell>
                <RegisterCell last>
                  <span className="inline-flex gap-2">
                    {l.links.map(k => <a key={k.url} href={k.url} target={k.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-trs-ink no-underline hover:underline">{k.label} ↗</a>)}
                  </span>
                </RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}

      {tab === 'renewal' && pack && (
        <>
          <Register label="Renewal pack" minWidth={720}>
            <RegisterHead>
              <RegisterTh first>Figure</RegisterTh>
              <RegisterTh align="right">This period</RegisterTh>
              <RegisterTh align="right">Last period</RegisterTh>
              <RegisterTh align="right" last>Change</RegisterTh>
            </RegisterHead>
            <tbody>
              {packRows(pack.current, pack.prior, ccy, policy.is_eb).map(r => (
                <RegisterRow key={r.label}>
                  <RegisterCell first identityWidth={240}>{r.label}</RegisterCell>
                  <RegisterCell align="right" className="tabular-nums">{r.now}</RegisterCell>
                  <RegisterCell align="right" className="tabular-nums">{r.before}</RegisterCell>
                  <RegisterCell align="right" className="tabular-nums" last>{r.change}</RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
          <Register label="Next period" minWidth={720}>
            <RegisterHead>
              <RegisterTh first>Projection</RegisterTh>
              <RegisterTh align="right">Low</RegisterTh>
              <RegisterTh align="right">High</RegisterTh>
              <RegisterTh last>Basis</RegisterTh>
            </RegisterHead>
            <tbody>
              <RegisterRow>
                <RegisterCell first identityWidth={240}>At this year&apos;s rate</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(pack.projection.same_rate, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(pack.projection.same_rate, ccy)}</RegisterCell>
                <RegisterCell last nowrap={false}>{pack.projection.basis}</RegisterCell>
              </RegisterRow>
              <RegisterRow>
                <RegisterCell first identityWidth={240}>{pack.projection.band.label}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(pack.projection.low, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(pack.projection.high, ccy)}</RegisterCell>
                <RegisterCell last nowrap={false}>{pack.projection.band.low_pct >= 0 ? '+' : ''}{pack.projection.band.low_pct}% to +{pack.projection.band.high_pct}% · {pack.projection.assumptions.join(' ')}</RegisterCell>
              </RegisterRow>
              <RegisterRow>
                <RegisterCell first identityWidth={240}>Budget</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(pack.projection.high, ccy)}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{fmtAmount(pack.projection.high, ccy)}</RegisterCell>
                <RegisterCell last nowrap={false}>High of the range, as billed</RegisterCell>
              </RegisterRow>
              {pack.missing.map(m => (
                <RegisterRow key={m}>
                  <RegisterCell first identityWidth={240}>Not on file</RegisterCell>
                  <RegisterCell align="right">—</RegisterCell>
                  <RegisterCell align="right">—</RegisterCell>
                  <RegisterCell last nowrap={false}>{m}</RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </>
      )}
    </div>
  )
}

type PackRow = { label: string; now: string; before: string; change: string }

function packRows(c: PeriodFigures, q: PeriodFigures | null, ccy: string, eb: boolean): PackRow[] {
  const moneyRow = (label: string, a: number | null, b: number | null | undefined): PackRow => ({
    label, now: fmtAmount(a, ccy), before: q ? fmtAmount(b ?? null, ccy) : '—',
    change: a != null && b != null ? fmtAmount(a - b, ccy) : '—',
  })
  const countRow = (label: string, a: number | null, b: number | null | undefined): PackRow => ({
    label, now: n(a), before: q ? n(b) : '—', change: a != null && b != null ? `${a - b >= 0 ? '+' : ''}${a - b}` : '—',
  })
  const rows: PackRow[] = [
    { label: 'Period', now: `${c.start_date ? fmtDate(c.start_date) : '?'} – ${c.end_date ? fmtDate(c.end_date) : '?'}`, before: q ? `${q.start_date ? fmtDate(q.start_date) : '?'} – ${q.end_date ? fmtDate(q.end_date) : '?'}` : '—', change: '' },
    moneyRow('Premium at inception', c.premium_inception, q?.premium_inception),
    moneyRow('Endorsements, net', c.endorsements_net, q?.endorsements_net),
    countRow('Endorsements, count', c.endorsements_count, q?.endorsements_count),
    moneyRow('Net premium', c.premium_net, q?.premium_net),
    moneyRow('GST billed', c.gst, q?.gst),
    moneyRow('Premium earned to date', c.earned_premium, q?.earned_premium),
    countRow('Claims notified', c.claims_count, q?.claims_count),
    countRow('Claims open', c.claims_open, q?.claims_open),
    moneyRow('Claims paid', c.claims_paid, q?.claims_paid),
    { label: 'Loss ratio', now: pct(c.loss_ratio), before: q ? pct(q.loss_ratio) : '—', change: c.loss_ratio != null && q?.loss_ratio != null ? `${Math.round((c.loss_ratio - q.loss_ratio) * 100)} pts` : '—' },
  ]
  if (eb) rows.push(
    countRow('Members at inception', c.members_inception, q?.members_inception),
    countRow('Members now', c.members_now, q?.members_now),
    countRow('Joiners', c.joiners, q?.joiners),
    countRow('Leavers', c.leavers, q?.leavers),
    moneyRow('Rate per head', c.rate_per_head, q?.rate_per_head),
  )
  if (c.sum_insured != null || q?.sum_insured != null) rows.push(moneyRow('Sum insured', c.sum_insured, q?.sum_insured))
  return rows
}
