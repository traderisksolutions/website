'use client'

/**
 * A quotation's census and policy: New quotation's screen with the quotation's own census, last
 * year's policy and details filled. A file added replaces what is on file; Confirm reprices the
 * same quotation and returns to its Compare cover.
 */
import { useParams } from 'next/navigation'
import { NewEb } from '@/components/group-benefits/NewEb'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'

export default function EditQuotationPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: '#0f1412' }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-8 pb-20">
        <Breadcrumbs className="mb-4" current={{ label: 'Census and policy', href: `/pricing-matrix/quote/${id}/edit` }} fallback={{ label: 'Compare cover', href: `/pricing-matrix/quote/${id}/compare` }} />
        <h1 className="m-0 mb-6 text-[32px] font-medium tracking-[-0.03em] leading-[1.1]">Census and policy</h1>
        <NewEb quotationId={id} />
      </div>
    </div>
  )
}
