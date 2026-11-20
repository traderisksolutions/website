'use client'

/**
 * Employment Benefits quotation by category (src/components/eb/EbQuotation.tsx), the one quotation
 * screen since 20 Nov 2026. Reached from the navigation, from an Inbox thread's "Open census"
 * (?thread=<id> lists that thread's files), from the company page or a renewal (?company=<id> fills
 * the company), from an HR link (?hrLink=<id> takes the list HR submitted) and from a proposal's
 * Edit quotation (?quotation=<id> reopens a kept quotation: census, design and insurers).
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { EbQuotation } from '@/components/eb/EbQuotation'

const UUID = /^[0-9a-f-]{36}$/i

export default function EbPage() {
  return <Suspense fallback={null}><Eb /></Suspense>
}

function Eb() {
  const p = useSearchParams()
  const id = (k: string) => { const v = p.get(k) ?? ''; return UUID.test(v) ? v : null }
  const quotation = id('quotation')
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: '#0f1412' }}>
      <div className="mx-auto max-w-[1500px] px-4 sm:px-12 pt-8 pb-20">
        <Breadcrumbs className="mb-4" current={quotation ? { label: 'Edit quotation', href: `/eb?quotation=${quotation}` } : { label: 'Employment Benefits', href: '/eb' }} fallback={quotation ? { label: 'Proposal', href: `/eb/proposal/${quotation}` } : { label: 'Inbox', href: '/engagement' }} />
        <h1 className="m-0 mb-6 text-[32px] font-medium tracking-[-0.03em] leading-[1.1]">{quotation ? 'Edit quotation' : 'Employment Benefits'}</h1>
        <EbQuotation key={quotation ?? 'new'} threadId={p.get('thread')} companyId={id('company') ?? id('companyId')} hrLinkId={id('hrLink')} quotationId={quotation} />
      </div>
    </div>
  )
}
