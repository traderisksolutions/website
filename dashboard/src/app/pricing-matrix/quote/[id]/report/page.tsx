'use client'

/**
 * The client report: the PDF itself, previewed in the page, with a download.
 *
 * One document for everyone — what a broker previews here is byte for byte what they download
 * and send, rendered from the saved quotation on each request (src/lib/gb/report-pdf.tsx). The
 * earlier HTML version printed from the browser and ran off the right edge of A4.
 */

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Download } from 'lucide-react'

export default function QuoteReportPage() {
  const { id } = useParams<{ id: string }>()
  const [company, setCompany] = useState<string | null>(null)
  const src = `/api/group-benefits/quote/${id}/report-pdf`

  useEffect(() => {
    fetch(`/api/group-benefits/quote/${id}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => setCompany(d?.quotation?.company_name ?? null)).catch(() => {})
  }, [id])

  return (
    <div className="bg-[#f8f9fa] min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] flex flex-col" style={{ color: '#202124' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3 bg-white" style={{ borderBottom: '1px solid #e8eaed' }}>
        <div className="flex items-center gap-4 min-w-0">
          <a href={`/pricing-matrix/quote/${id}`} className="text-[13px] hover:underline flex-shrink-0" style={{ color: '#5f6368' }}>← Quotation</a>
          <h1 className="m-0 text-[15px] font-medium truncate">{company ? `${company} · Client report` : 'Client report'}</h1>
        </div>
        <a href={`${src}?download=1`}
           className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#202124] text-white hover:opacity-90">
          <Download size={14} /> Download PDF
        </a>
      </div>
      <div className="relative flex-1 p-3 sm:p-6">
        <iframe title="Client report" src={src}
                className="w-full h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h)-110px)] min-h-[520px] rounded-lg bg-white"
                style={{ border: '1px solid #e8eaed' }} />
      </div>
    </div>
  )
}
