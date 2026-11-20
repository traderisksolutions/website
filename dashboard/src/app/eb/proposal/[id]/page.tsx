'use client'

/**
 * An Employment Benefits proposal (Jarod, 19 Nov 2026): the PDF built from a kept quotation, the
 * checks before it goes, Download, Edit quotation (/eb?quotation=<id>) and Email to client
 * (/eb/proposal/<id>/email). Email to client is never offered once the email has gone; a send that
 * went but was not recorded shows Try again. No model is called.
 */
import { use } from 'react'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { LinkBtn, Spinner } from '@/components/crm/primitives'
import { Checks, MarkSent, PdfPreview, shortDate, useQuotation } from '@/components/eb/proposal-shared'

export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { view, error, reload } = useQuotation(id)
  const q = view?.quotation
  const owner = q?.company_id ? { label: q.company_name, href: `/companies/${q.company_id}` } : { label: 'Employment Benefits', href: '/eb' }
  const gone = !!q && (!!q.sent_at || q.draft_sent)
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-8 pb-20 flex flex-col gap-5">
        <Breadcrumbs current={q ? { label: `Proposal V${q.version}`, href: `/eb/proposal/${id}` } : null} fallback={owner} />
        {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
        {!view ? (error ? null : <Spinner label="Reading the quotation…" />) : <>
          <PageHeader title={`Proposal V${q!.version}`}
            meta={`${q!.company_name} · ${view.model.products.length} insurers · ${view.model.period} · ${q!.sent_at ? `sent ${shortDate(q!.sent_at)} to ${q!.sent_to}` : `saved ${shortDate(q!.created_at)}`}`}
            actions={<>
              <LinkBtn href={`/api/eb/quotations/${id}/pdf?download=1`}>Download PDF</LinkBtn>
              <LinkBtn href={`/eb?quotation=${id}`} level={gone ? 'primary' : 'secondary'}>Edit quotation</LinkBtn>
              {!gone && <LinkBtn level="primary" href={`/eb/proposal/${id}/email`}>Email to client</LinkBtn>}
            </>} />
          {q!.draft_sent && !q!.sent_at && <MarkSent id={id} onDone={() => void reload()} />}
          <Checks checks={view.checks} />
          <PdfPreview id={id} />
        </>}
      </div>
    </div>
  )
}
