'use client'

/**
 * Back to where the person came from, then the trail: "← Empyrion — group medical renewal ›
 * Quotation · Empyrion DC". Reads the session trail (src/lib/nav/trail.ts); with nothing on it,
 * Back goes to the page's parent.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useTrail, type Crumb } from '@/lib/nav/trail'

const INK = '#0f1412', MUTED = '#4a5550', SUBTLE = '#8c958f'
const short = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function Breadcrumbs({ current, fallback, className }: { current: Crumb | null; fallback: Crumb; className?: string }) {
  const { before, back } = useTrail(current, fallback)
  const trail = before.slice(-3)
  return (
    <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${className ?? ''}`}>
      <Link href={back.href} className="inline-flex items-center gap-1.5 no-underline hover:underline" style={{ color: INK }}><ArrowLeft size={14} /> {short(back.label)}</Link>
      {trail.length > 1 && (
        <span className="inline-flex items-center gap-1.5" style={{ color: MUTED }}>
          <span style={{ color: SUBTLE }}>·</span>
          {trail.slice(0, -1).map(c => (
            <span key={c.href} className="inline-flex items-center gap-1.5">
              <Link href={c.href} className="no-underline hover:underline" style={{ color: MUTED }}>{short(c.label, 32)}</Link>
              <span style={{ color: SUBTLE }}>›</span>
            </span>
          ))}
          <span>{short(trail.at(-1)!.label, 32)}</span>
          {current && <><span style={{ color: SUBTLE }}>›</span><span style={{ color: INK }}>{short(current.label, 32)}</span></>}
        </span>
      )}
    </nav>
  )
}
