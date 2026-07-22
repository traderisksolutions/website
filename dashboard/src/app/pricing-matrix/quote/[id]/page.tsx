'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { PmComparison } from '@/components/pricing-matrix/PmComparison'
import { PmQuoteActions } from '@/components/pricing-matrix/PmQuoteActions'
import type { QuoteResult } from '@/lib/pm-quote'
import type { Recommendation } from '@/lib/pm-recommend'

type Quote = { id: string; company_name: string | null; effective_date: string | null; member_count: number; results: QuoteResult | null; recommendation: Recommendation | null; priorities: string | null; created_at: string }

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(`/api/pricing-matrix/quote/${id}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => { setQuote(d); setLoading(false) }) }, [id])

  if (loading) return <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-24 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
  if (!quote) return <div className="p-8 text-sm text-rose-600">Not found.</div>

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <Link href="/pricing-matrix/quote" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={14} /> Quotes</Link>
      <h1 className="text-[18px] font-semibold text-foreground">{quote.company_name || 'Untitled quote'}</h1>
      <p className="text-[12px] text-muted-foreground/70 mb-5">{quote.member_count} lives{quote.effective_date ? ` · eff. ${quote.effective_date}` : ''} · {new Date(quote.created_at).toLocaleString('en-SG')}</p>
      {quote.results ? (
        <div className="flex flex-col gap-6">
          <PmComparison result={quote.results} />
          <PmQuoteActions quoteId={quote.id} results={quote.results} initialRecommendation={quote.recommendation} initialPriorities={quote.priorities} />
        </div>
      ) : <p className="text-[13px] text-muted-foreground">No results stored for this quote.</p>}
    </div>
  )
}
