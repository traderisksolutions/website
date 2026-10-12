'use client'

import { ExternalLink } from 'lucide-react'
import { looksLikeUrl, safeHref, type EvidenceNode } from '@/lib/sales/evidence'

const INK = '#202124'
const MUTED = '#5f6368'

// Renders the lead tool's free-form JSON as text nodes only. Lead text comes from the open web:
// no HTML, and only http(s) strings become links.

export function SafeLink({ href, children }: { href: string; children?: React.ReactNode }) {
  const safe = safeHref(href)
  if (!safe) return <span className="break-all">{children ?? href}</span>
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all underline underline-offset-2" style={{ color: INK }}>
      <span className="min-w-0 break-all">{children ?? safe.replace(/^https?:\/\/(www\.)?/, '')}</span>
      <ExternalLink size={11} className="shrink-0" aria-hidden />
    </a>
  )
}

export function Evidence({ node }: { node: EvidenceNode }) {
  if (node.kind === 'text') return looksLikeUrl(node.text) ? <SafeLink href={node.text} /> : <span className="whitespace-pre-wrap break-words">{node.text}</span>
  if (node.kind === 'list') {
    return <ul className="m-0 flex list-disc flex-col gap-1 pl-4">{node.items.map((it, i) => <li key={i}><Evidence node={it} /></li>)}</ul>
  }
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
      {node.fields.map((f, i) => (
        <div key={i} className="contents">
          <dt className="text-[12px] font-medium" style={{ color: MUTED }}>{f.label}</dt>
          <dd className="m-0 min-w-0 text-[13.5px]" style={{ color: INK }}><Evidence node={f.value} /></dd>
        </div>
      ))}
    </dl>
  )
}
