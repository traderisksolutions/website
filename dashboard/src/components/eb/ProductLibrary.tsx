'use client'

/**
 * Employment Benefits › Products (docs/eb-v2.md P3): each house product as the workbook holds it,
 * every rate table of the same insurer compared rate by rate (src/lib/gb/library.ts), and the
 * brochure folder's read queue. Read only: Nathan settles a difference in the workbook or the table.
 */
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { PageFrame } from '@/components/page-frame'
import { Btn } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDate } from '@/lib/format'
import type { Library, LibraryTable } from '@/lib/gb/library-server'

const n2 = (v: number) => v.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const tableName = (t: LibraryTable) => [t.planYear, t.source ?? t.insurer].filter(Boolean).join(' · ')

export function ProductLibrary({ data, error }: { data: Library | null; error: string | null }) {
  const router = useRouter()
  if (!data) return (
    <PageFrame>
      <PageHeader title="Products" />
      <p className="m-0 text-body text-trs-neg" role="alert">{error ?? 'The products could not be read.'}</p>
      <div><Btn onClick={() => router.refresh()}>Retry</Btn></div>
    </PageFrame>
  )
  const wb = data.workbook
  const tables = data.products.flatMap(p => p.tables.map(t => ({ product: p.product, t })))
  const queue = [...data.queue.changed.map(r => ({ r, status: 'Changed since read' })), ...data.queue.notRead.map(r => ({ r, status: 'Not read' }))]
  return (
    <PageFrame className="gap-8">
      <PageHeader title="Products" meta={wb ? `${wb.name} · modified ${fmtDate(wb.modifiedAt)} · imported ${fmtDate(wb.readAt)}` : 'No workbook imported'} />

      <Register label="Products" minWidth={980}>
        <RegisterHead>
          <RegisterTh first width={220}>Product</RegisterTh>
          <RegisterTh>Covers</RegisterTh><RegisterTh>Plans</RegisterTh><RegisterTh>Rates</RegisterTh><RegisterTh>Benefits</RegisterTh>
          <RegisterTh>Rate tables</RegisterTh><RegisterTh>Same</RegisterTh><RegisterTh>With GST</RegisterTh><RegisterTh>Different</RegisterTh>
          <RegisterTh>Workbook only</RegisterTh><RegisterTh last>Table only</RegisterTh>
        </RegisterHead>
        <tbody>
          {data.products.map(p => {
            const sum = (k: 'equal' | 'gst' | 'workbookOnly' | 'tableOnly') => p.tables.reduce((a, t) => a + t.comparison[k], 0)
            return (
              <RegisterRow key={p.product}>
                <RegisterCell first primary={p.product} align="left" />
                <RegisterCell>{p.covers.length}</RegisterCell>
                <RegisterCell>{p.covers.reduce((a, c) => a + c.plans, 0)}</RegisterCell>
                <RegisterCell>{p.rates}</RegisterCell>
                <RegisterCell>{p.benefits}</RegisterCell>
                <RegisterCell>{p.tables.length}</RegisterCell>
                <RegisterCell>{sum('equal')}</RegisterCell>
                <RegisterCell>{sum('gst')}</RegisterCell>
                <RegisterCell><span className={p.tables.some(t => t.differTotal) ? 'font-medium text-trs-warn' : ''}>{p.tables.reduce((a, t) => a + t.differTotal, 0)}</span></RegisterCell>
                <RegisterCell>{sum('workbookOnly')}</RegisterCell>
                <RegisterCell last>{sum('tableOnly')}</RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>

      {tables.filter(({ t }) => t.differTotal > 0).map(({ product, t }) => (
        <section key={t.id} className="flex flex-col gap-2" aria-label={`Differences: ${product}, ${tableName(t)}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="m-0 text-heading font-semibold">{`${product} · ${tableName(t)}`}</h2>
            <span className="text-small text-trs-muted">{`${t.differTotal} of ${t.comparison.compared} different${t.differTotal > t.comparison.differ.length ? ` · largest ${t.comparison.differ.length}` : ''} · S$ a year`}</span>
          </div>
          <Register label={`Differences: ${product}, ${tableName(t)}`} minWidth={900} maxHeight="420px">
            <RegisterHead>
              <RegisterTh first width={170}>Cover</RegisterTh><RegisterTh>Plan</RegisterTh><RegisterTh>Ages</RegisterTh><RegisterTh>Life</RegisterTh>
              <RegisterTh>Class</RegisterTh><RegisterTh>Basis</RegisterTh><RegisterTh>Workbook</RegisterTh><RegisterTh>Rate table</RegisterTh><RegisterTh last>Difference</RegisterTh>
            </RegisterHead>
            <tbody>
              {t.comparison.differ.map((d, i) => (
                <RegisterRow key={i}>
                  <RegisterCell first primary={d.cover} align="left" />
                  <RegisterCell align="left">{d.plan}</RegisterCell>
                  <RegisterCell>{d.ages}</RegisterCell>
                  <RegisterCell>{d.life}</RegisterCell>
                  <RegisterCell>{d.cls}</RegisterCell>
                  <RegisterCell>{d.renewal ? 'Renewal' : 'All'}</RegisterCell>
                  <RegisterCell>{n2(d.workbook)}</RegisterCell>
                  <RegisterCell>{n2(d.table)}</RegisterCell>
                  <RegisterCell last><span className="font-medium text-trs-warn">{pct(d.pct)}</span></RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        </section>
      ))}

      <section className="flex flex-col gap-2" aria-label="Read queue">
        <h2 className="m-0 text-heading font-semibold">Read queue</h2>
        {!data.queue.configured ? <p className="m-0 text-body text-trs-muted">Brochure folder not connected.</p>
          : data.queue.error ? <p className="m-0 text-body text-trs-neg" role="alert">{data.queue.error}</p>
          : queue.length === 0 ? <p className="m-0 text-body text-trs-muted">Every file in the brochure folder is read.</p>
          : (
            <Register label="Read queue" minWidth={760}>
              <RegisterHead>
                <RegisterTh first width={180}>Status</RegisterTh><RegisterTh>Insurer</RegisterTh><RegisterTh>Plan year</RegisterTh><RegisterTh>File</RegisterTh><RegisterTh last>Modified</RegisterTh>
              </RegisterHead>
              <tbody>
                {queue.map(({ r, status }) => (
                  <RegisterRow key={r.driveFileId}>
                    <RegisterCell first primary={status} align="left" />
                    <RegisterCell align="left">{r.insurer}</RegisterCell>
                    <RegisterCell>{r.planYear ?? '–'}</RegisterCell>
                    <RegisterCell align="left" title={r.filename}>{r.webViewLink ? <a href={r.webViewLink} target="_blank" rel="noreferrer" className="no-underline hover:underline text-trs-ink">{r.filename}</a> : r.filename}</RegisterCell>
                    <RegisterCell last>{fmtDate(r.modifiedAt)}</RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          )}
      </section>

      {data.others.length > 0 && (
        <Register label="Rate tables outside the workbook" minWidth={640}>
          <RegisterHead><RegisterTh first width={240}>Rate tables outside the workbook</RegisterTh><RegisterTh>Plan year</RegisterTh><RegisterTh last>Source</RegisterTh></RegisterHead>
          <tbody>
            {data.others.map(o => (
              <RegisterRow key={o.id}>
                <RegisterCell first primary={o.insurer ?? '–'} align="left" />
                <RegisterCell>{o.planYear ?? '–'}</RegisterCell>
                <RegisterCell last align="left">{o.source ?? '–'}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </PageFrame>
  )
}
