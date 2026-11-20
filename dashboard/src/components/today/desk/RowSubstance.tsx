'use client'

/**
 * A client row's substance (approved design, 20 Nov 2026): the facts line under the name, and on
 * an open row the condensed state, documents, insurers, timeline, links, suggested projects and
 * each project's parties. Numbers, labels, dates and actions only; no sentences.
 */
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Btn, Chip, InlineSpinner } from '@/components/crm/primitives'
import { fmtDay, money, timeAgo } from '@/lib/format'
import type { Condensed } from '@/lib/today/condense'
import type { Parties } from '@/lib/today/projects'
import type { RowFacts, WaitingOn } from '@/lib/today/substance'
import type { RowDetail } from '@/lib/today/substance-server'
import { previewHref, type PrivateInbox } from '@/lib/today/desk'
import { ThreadTitle } from './PrivateThread'

const DAY = 86_400_000
const ago = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY)) : null)
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

const Label = ({ children }: { children: React.ReactNode }) => <span className="text-small font-semibold text-trs-muted">{children}</span>

/** Renews, Current, Stage, Waiting on: each shown only when known. */
export function FactsLine({ facts, waiting }: { facts: RowFacts | null | undefined; waiting: WaitingOn | null }) {
  const items: [string, string][] = []
  if (facts?.renews) items.push(['Renews', `${fmtDay(facts.renews.date)} · ${facts.renews.days < 0 ? `${-facts.renews.days} days ago` : plural(facts.renews.days, 'day')}`])
  const premium = facts?.premium?.length ? facts.premium.map(p => money(p.amount, { ccy: p.currency, dp: 0 })).join(' + ') : null
  if (facts?.insurer || premium) items.push(['Current', [facts?.insurer, premium].filter(Boolean).join(' · ')])
  if (facts?.stage) items.push(['Stage', facts.stage])
  if (waiting) { const d = ago(waiting.since); items.push(['Waiting on', `${waiting.who}${d != null ? ` · ${plural(d, 'day')}` : ''}`]) }
  if (!items.length) return null
  return (
    <span className="flex basis-full flex-wrap gap-x-4 gap-y-0.5 pl-0 text-body text-trs-muted md:pl-10" aria-label="Facts">
      {items.map(([k, v]) => <span key={k}>{k} <span className="font-medium text-trs-ink">{v}</span></span>)}
    </span>
  )
}

/** Client asked, TRS promised, Owed, Next step: label, date and the short phrase. */
export function CondensedFacts({ c, title, onCondense, busy, canRun }: {
  c: (Condensed & { stale?: boolean }) | null; title: string; onCondense: () => void; busy: boolean; canRun: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5" aria-label={`${title} state`}>
      <span className="flex flex-wrap items-center gap-2">
        <Label>State</Label>
        {c && <span className="text-small text-trs-muted">Condensed {timeAgo(c.at)}{c.stale ? ' · threads changed since' : ''}</span>}
        {canRun && <Btn size="xs" level="tertiary" onClick={onCondense} loading={busy} disabled={busy}><Sparkles size={13} /> {c ? 'Condense again' : 'Condense'}</Btn>}
      </span>
      {c && c.facts.length === 0 && <span className="text-body text-trs-muted">No fact found in the threads.</span>}
      {c && c.facts.length > 0 && (
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[140px_1fr]">
          {c.facts.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-body text-trs-muted">{f.label === 'Owed' ? `Owed by ${f.party}` : f.label}</dt>
              <dd className="m-0 text-body text-trs-ink">{f.date ? <span className="font-mono text-small text-trs-muted">{fmtDay(f.date)} · </span> : null}{f.what}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** The people on a project's threads, by side. */
export function PartiesLine({ parties }: { parties: Parties }) {
  const fmt = (ps: { name: string | null; email: string }[]) => ps.slice(0, 4).map(p => p.name || p.email).join(', ') + (ps.length > 4 ? ` +${ps.length - 4}` : '')
  const rows: [string, string][] = []
  if (parties.client.length) rows.push(['Client', fmt(parties.client)])
  for (const g of parties.insurers) rows.push([g.insurer, fmt(g.people)])
  if (parties.others.length) rows.push(['Others', fmt(parties.others)])
  if (!rows.length) return null
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-body" aria-label="Parties">
      {rows.map(([k, v]) => <span key={k} className="text-trs-muted">{k} <span className="text-trs-ink">{v}</span></span>)}
    </span>
  )
}

/** Suggested project chips: the owner confirms one and the matching threads move under it. */
export function SuggestedProjects({ suggestions, mine, busy, onConfirm }: {
  suggestions: RowDetail['suggestions']; mine: boolean; busy: string | null; onConfirm: (name: string, threadIds: string[]) => void
}) {
  if (!suggestions.length) return null
  return (
    <span className="flex flex-wrap items-center gap-2" aria-label="Suggested projects">
      <Label>Suggested project</Label>
      {suggestions.map(s => mine
        ? <Btn key={s.name} size="xs" onClick={() => onConfirm(s.name, s.threadIds)} loading={busy === `suggest:${s.name}`} disabled={!!busy} title={`Put ${plural(s.threadIds.length, 'thread')} under ${s.name}`}>{s.name} · {s.threadIds.length}</Btn>
        : <Chip key={s.name}>{s.name} · {s.threadIds.length}</Chip>)}
    </span>
  )
}

/** Documents, insurers, timeline and links of an open row. */
export function RowDetailBlocks({ detail, loading, error, onRetry, onNotice, privateOf }: {
  detail: RowDetail | null; loading: boolean; error: string | null; onRetry: () => void; onNotice: (m: string) => void
  /** Whose inbox holds a thread the viewer may not open; null when they may. */
  privateOf: (threadId: string) => PrivateInbox | null
}) {
  if (loading && !detail) return <InlineSpinner label="Reading the client’s records…" />
  if (error && !detail) return <span role="alert" className="flex items-center gap-2 text-body text-trs-neg">Details did not load. {error} <Btn size="xs" onClick={onRetry}>Retry</Btn></span>
  if (!detail) return null
  const { documents, insurers, timeline, links } = detail
  return (
    <div className="flex flex-col gap-4">
      {(documents.length > 0 || insurers.length > 0) && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5" aria-label="Documents">
            <Label>Documents</Label>
            {documents.length === 0 && <span className="text-body text-trs-muted">None on file.</span>}
            {documents.map((d, i) => {
              const href = d.attachmentId && d.canOpen ? previewHref({ storage_url: `gmail:${d.attachmentId}` }) : null
              return (
                <span key={i} className="flex min-w-0 items-center gap-2 text-body">
                  <span className="w-40 flex-none text-trs-ink">{d.label}</span>
                  <span className="min-w-0 flex-1 truncate text-trs-muted" title={d.filename ?? undefined}>
                    {d.state === 'missing' ? 'Missing' : href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-trs-ink hover:underline">{d.filename}</a> : d.filename}
                    {d.at ? ` · ${fmtDay(d.at)}` : ''}
                  </span>
                  <Chip tone={d.state === 'held' ? 'green' : 'amber'}>{d.state === 'held' ? 'Held' : 'Ask client'}</Chip>
                </span>
              )
            })}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5" aria-label="Insurers">
            <Label>Insurers</Label>
            {insurers.length === 0 && <span className="text-body text-trs-muted">No open request to an insurer.</span>}
            {insurers.map(r => (
              <span key={r.insurer} className="flex min-w-0 items-center gap-2 text-body">
                <span className="w-32 flex-none truncate font-medium text-trs-ink">{r.insurer}</span>
                <span className="min-w-0 flex-1 truncate text-trs-muted">{r.status}{r.since ? ` ${fmtDay(r.since)}` : ''}{r.days != null ? ` · ${plural(r.days, 'day')}` : ''}</span>
                {r.waiting && <Chip tone="amber">Waiting</Chip>}
              </span>
            ))}
          </div>
        </div>
      )}
      {timeline.length > 0 && (
        <div className="flex flex-col gap-1" aria-label="Timeline">
          <Label>Timeline</Label>
          {timeline.map((e, i) => (
            <span key={i} className="grid grid-cols-[72px_140px_1fr] items-baseline gap-2 text-body">
              <span className="font-mono text-small text-trs-muted">{fmtDay(e.at)}</span>
              <span className="truncate text-trs-muted">{e.who}</span>
              <span className="min-w-0 truncate">{e.threadId ? <ThreadTitle threadId={e.threadId} subject={e.what} owner={privateOf(e.threadId)} onNotice={onNotice} className="!font-normal" /> : e.what}</span>
            </span>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <span className="flex flex-wrap gap-3" aria-label="Links">
          {links.map(l => <Link key={l.href} href={l.href} className="text-body text-trs-green-2 underline-offset-[3px] hover:underline">{l.label}</Link>)}
        </span>
      )}
    </div>
  )
}
