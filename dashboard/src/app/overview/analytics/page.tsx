import Link from 'next/link'

const SECTIONS = [
  {
    title: 'AI Usage',
    desc:  'Tracks token consumption and cost by feature — auto-summarize, draft replies, RAG indexing, outbound search, and more. Broken down by day and filterable by date range.',
    href:  '/analytics/ai-usage',
  },
  {
    title: 'Email Evaluations',
    desc:  'Shows every AI draft evaluation score (1–5), what the AI wrote vs. what you sent, and the specific rule extracted from each edit. Includes a learnings tab grouped by email type.',
    href:  '/analytics/eval',
  },
  {
    title: 'RAG Index',
    desc:  'Lists all documents indexed from Google Drive into the RAG knowledge base. Shows chunk count, embedding status, and last-indexed timestamp. Use this to verify your knowledge base is current.',
    href:  '/analytics/rag-index',
  },
]

export default function AnalyticsOverviewPage() {
  return (
    <div className="max-w-[740px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[12px] text-muted-foreground">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <span className="text-foreground">Analytics</span>
      </div>

      <h2 className="text-[18px] font-bold text-foreground tracking-tight mb-1.5">Analytics</h2>
      <p className="text-[14px] text-muted-foreground leading-[1.7] mb-8">
        Three analytics dashboards covering AI cost, draft quality, and knowledge base health.
      </p>

      <div className="flex flex-col gap-4">
        {SECTIONS.map(s => (
          <div key={s.href}
            className="bg-card border border-border rounded-xl p-5 flex items-start justify-between gap-4"
            style={{ boxShadow: 'var(--card-shadow)' }}>
            <div>
              <p className="text-[13.5px] font-semibold text-foreground mb-1">{s.title}</p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-[440px]">{s.desc}</p>
            </div>
            <Link
              href={s.href}
              className="flex-shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-md border border-border bg-background no-underline text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors whitespace-nowrap"
            >
              Open →
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <Link href="/overview" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← Back to Overview
        </Link>
      </div>
    </div>
  )
}
