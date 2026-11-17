'use client'

/**
 * Employment Benefits quotation by category (src/components/eb/EbQuotation.tsx). Reached from the
 * navigation and from an Inbox thread's "Open census" (?thread=<id> lists that thread's files).
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { EbQuotation } from '@/components/eb/EbQuotation'

export default function EbPage() {
  return <Suspense fallback={null}><Eb /></Suspense>
}

function Eb() {
  const p = useSearchParams()
  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white" style={{ color: '#0f1412' }}>
      <div className="mx-auto max-w-[1500px] px-6 sm:px-12 pt-8 pb-20">
        <Breadcrumbs className="mb-4" current={{ label: 'Employment Benefits', href: '/eb' }} fallback={{ label: 'Inbox', href: '/engagement' }} />
        <h1 className="m-0 mb-6 text-[32px] font-medium tracking-[-0.03em] leading-[1.1]">Employment Benefits</h1>
        <EbQuotation threadId={p.get('thread')} />
      </div>
    </div>
  )
}
