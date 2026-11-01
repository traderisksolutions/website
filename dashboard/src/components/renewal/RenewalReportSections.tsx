/**
 * The renewal report's second page on screen: the options the client can act on, the dates TRS
 * works to, and what is not on file. Server component; reads the same model the PDF renders.
 */
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import type { ReportModel } from '@/lib/policies/ledger/report-model'

export function RenewalReportSections({ m }: { m: ReportModel }) {
  return (
    <>
      <Register label="Renewal options" minWidth={720}>
        <RegisterHead>
          <RegisterTh first>Option</RegisterTh>
          <RegisterTh align="right">Premium ({m.currency})</RegisterTh>
          <RegisterTh last>Basis</RegisterTh>
        </RegisterHead>
        <tbody>
          {m.options.map(o => (
            <RegisterRow key={o.option}>
              <RegisterCell first identityWidth={260}>{o.option}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{o.premium}</RegisterCell>
              <RegisterCell last nowrap={false}>{o.basis}</RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
      <Register label="What TRS will do" minWidth={480}>
        <RegisterHead>
          <RegisterTh first>Step</RegisterTh>
          <RegisterTh align="right" last>Date</RegisterTh>
        </RegisterHead>
        <tbody>
          {m.plan.map(r => (
            <RegisterRow key={r.step}>
              <RegisterCell first identityWidth={260}>{r.step}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums" last>{r.date}</RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
      {m.not_on_file.length > 0 && (
        <Register label="Not on file" minWidth={480}>
          <RegisterHead>
            <RegisterTh first>Figure</RegisterTh>
            <RegisterTh last>Source</RegisterTh>
          </RegisterHead>
          <tbody>
            {m.not_on_file.map(r => (
              <RegisterRow key={r.item}>
                <RegisterCell first identityWidth={260}>{r.item}</RegisterCell>
                <RegisterCell last nowrap={false}>{r.source}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
      <p className="m-0 text-[12px] text-trs-muted max-w-[90ch]">{m.footnote}</p>
    </>
  )
}
