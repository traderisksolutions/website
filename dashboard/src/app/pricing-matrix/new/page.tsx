'use client'

/**
 * Quotes › Employment Benefits › New quotation. Its own address, so Back and the breadcrumbs return
 * to where it was opened: the register, a company's Employment Benefits tab, a thread, Today.
 * ?company=<name>&companyId=<id> fills the company; ?thread=<id> lists that thread's files first.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { NewEb } from '@/components/group-benefits/NewEb'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'

export default function NewQuotationPage() {
  return <Suspense fallback={null}><NewQuotation /></Suspense>
}

function NewQuotation() {
  const p = useSearchParams()
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: '#0f1412' }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-8 pb-20">
        <Breadcrumbs className="mb-4" current={{ label: 'New quotation', href: '/pricing-matrix/new' }} fallback={{ label: 'Employment Benefits', href: '/pricing-matrix' }} />
        <h1 className="m-0 mb-6 text-[32px] font-medium tracking-[-0.03em] leading-[1.1]">New quotation</h1>
        <NewEb initialCompany={p.get('company') ?? undefined} initialCompanyId={p.get('companyId')} threadId={p.get('thread')} />
      </div>
    </div>
  )
}
