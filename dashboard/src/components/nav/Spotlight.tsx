'use client'

/**
 * ⌘K (20 Nov 2026): go to a page, or find an email. Type a name, an address, a subject, a file
 * name or any word: Threads · People · Companies · Files, newest first. Each thread names its
 * company, subject, people, last date and the inbox that holds it. Every connected inbox and
 * Operations is searched for everyone; a thread in a colleague's private inbox is listed by its
 * subject, people and files, and opening it names whose inbox holds it (ring-fence).
 * The index is thread_search (docs/search.md); before it exists the Inbox search answers threads.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Btn, InlineSpinner } from '@/components/crm/primitives'
import { fmtDay } from '@/lib/format'
import { peopleHits, searchTerms, hasEvery, type SearchAnswer, type ThreadHit } from '@/lib/search/query'
import { threadHref } from '@/lib/today/desk'
import type { Conversation } from '@/lib/mail/conversations'
import { usePrivateThread } from '@/components/today/desk/PrivateThread'

export type PageLink = { label: string; href: string }

type OldConv = { thread_id: string; subject: string | null; display_subject: string | null; companyId: string | null; companyName: string | null; companyKind: string | null; last_message_at?: string | null; created_at: string; mailboxes?: string[]; participants?: { name: string | null; email: string }[]; conversations?: Conversation[]; private?: { owner: string | null } }

/** Before the index exists: the Inbox's search (subject, senders, people; no email text), as hits. */
async function oldSearch(q: string, signal: AbortSignal): Promise<SearchAnswer> {
  const r = await fetch(`/api/engagement/conversations?q=${encodeURIComponent(q)}&people=1&conversations=1`, { cache: 'no-store', signal })
  const j = await r.json().catch(() => [])
  const words = searchTerms(q).words
  const threads: ThreadHit[] = (Array.isArray(j) ? j as OldConv[] : []).slice(0, 40).map(c => ({
    threadId: c.thread_id, subject: c.display_subject || c.subject || '(no subject)', companyId: c.companyId, companyName: c.companyName, companyKind: c.companyKind,
    people: c.participants ?? [], lastAt: c.last_message_at ?? c.created_at, mailboxes: c.mailboxes ?? [],
    inbox: (c.mailboxes ?? []).some(m => /^operations@/i.test(m)) || !(c.mailboxes ?? []).length ? 'Operations' : (c.mailboxes ?? []).map(m => m.split('@')[0].split('.')[0]).join(', '),
    canOpen: !c.private, owner: c.private ? (c.private.owner ?? 'a colleague').split(/[\s,]+/)[0] : null, via: 'subject', conversations: c.conversations,
  }))
  const companies = Array.from(new Map(threads.filter(t => t.companyId && t.companyName && hasEvery(t.companyName, words)).map(t => [t.companyId!, { id: t.companyId!, name: t.companyName!, kind: t.companyKind }])).values()).slice(0, 6)
  return { index: true, threads, people: peopleHits(threads, words), companies, files: [] }
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <li className="pt-2">
    <span className="block px-2.5 pb-1 text-small font-semibold text-trs-muted">{title}</span>
    <ul className="m-0 list-none p-0">{children}</ul>
  </li>
)
const rowCls = 'flex w-full min-w-0 flex-col items-start gap-0.5 rounded px-2.5 py-1.5 text-left no-underline text-trs-ink hover:bg-trs-canvas'

export function Spotlight({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (v: boolean) => void; pages: PageLink[] }) {
  const router = useRouter()
  const openPrivate = usePrivateThread()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<SearchAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setFound(null); setNotice(null); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setFound(null); setBusy(false); return }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      setBusy(true); setError(null)
      fetch(`/api/search?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal })
        .then(async r => {
          const j = await r.json().catch(() => ({})) as SearchAnswer | { index: false; error?: string }
          if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`)
          return j.index ? j : oldSearch(t, ctl.signal)
        })
        .then(a => { setFound(a); setBusy(false) })
        .catch(e => { if (!ctl.signal.aborted) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) } })
    }, 250)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [q])

  const pageHits = useMemo(() => pages.filter(h => h.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, q.trim() ? 5 : 12), [pages, q])

  async function openThread(t: Pick<ThreadHit, 'threadId' | 'canOpen' | 'owner'>) {
    if (t.canOpen) { router.push(threadHref(t.threadId)); onOpenChange(false); return }
    const m = await openPrivate(t.threadId, { name: t.owner ?? 'a colleague' })
    if (m) setNotice(m)
  }
  function enter() {
    if (pageHits[0] && (!found || !found.threads.length)) { router.push(pageHits[0].href); onOpenChange(false); return }
    if (found?.threads[0]) void openThread(found.threads[0])
  }

  const nothing = found && !found.threads.length && !found.people.length && !found.companies.length && !found.files.length && !pageHits.length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-[640px] translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Go to a page or find an email</DialogTitle>
        <div className="flex items-center gap-2 border-b border-trs-line px-3 py-1.5">
          <Search className="h-4 w-4 flex-none text-trs-muted" aria-hidden />
          <Input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} aria-label="Search pages and email"
            placeholder="Page, name, email, subject, file or any word"
            onKeyDown={e => { if (e.key === 'Enter') enter() }}
            className="border-0 px-1 shadow-none focus-visible:border-0" />
          {busy && <InlineSpinner />}
        </div>
        {notice && <p role="status" className="m-0 px-4 pt-2 text-body text-trs-ink">{notice}</p>}
        {error && <p role="alert" className="m-0 px-4 pt-2 text-body text-trs-neg">Search did not run. {error}</p>}
        <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-1.5">
          {pageHits.length > 0 && (
            <Group title="Pages">
              {pageHits.map(h => <li key={h.href}><Link href={h.href} onClick={() => onOpenChange(false)} className={rowCls}><span className="text-body">{h.label}</span></Link></li>)}
            </Group>
          )}
          {found && found.threads.length > 0 && (
            <Group title={`Threads · ${found.threads.length}`}>
              {found.threads.map(t => (
                <li key={t.threadId}>
                  <Btn level="tertiary" className={`${rowCls} !h-auto !justify-start !font-normal`} onClick={() => void openThread(t)} aria-label={`Open ${t.subject}`}>
                    <span className="flex w-full min-w-0 items-center gap-2">
                      {!t.canOpen && <Lock size={12} className="flex-none text-trs-muted" aria-label={`In ${t.owner}’s inbox`} />}
                      <span className="min-w-0 flex-1 truncate text-body font-medium text-trs-ink">{t.subject}</span>
                      <span className="flex-none font-mono text-small text-trs-muted">{fmtDay(t.lastAt)}</span>
                    </span>
                    {t.conversations && t.conversations.length > 1 && t.conversations.map(v => (
                      <span key={v.subject} className="flex w-full min-w-0 gap-2 pl-3 text-small text-trs-ink-2">
                        <span className="min-w-0 flex-1 truncate">{v.subject}</span>
                        <span className="flex-none text-trs-muted">{[v.people[0], v.insurer].filter(Boolean).join(' · ')} · {v.count} email{v.count === 1 ? '' : 's'} · {v.side === 'insurer' ? 'Insurer' : v.side === 'client' ? 'Client' : ''}</span>
                      </span>
                    ))}
                    <span className="w-full truncate text-small text-trs-muted">
                      {[t.companyName, t.people.slice(0, 3).map(p => p.name || p.email).join(', ') + (t.people.length > 3 ? ` +${t.people.length - 3}` : ''), t.canOpen ? t.inbox : `${t.owner}’s inbox`].filter(Boolean).join(' · ')}
                    </span>
                  </Btn>
                </li>
              ))}
            </Group>
          )}
          {found && found.people.length > 0 && (
            <Group title="People">
              {found.people.map(p => (
                <li key={p.email}>
                  <Btn level="tertiary" className={`${rowCls} !h-auto !justify-start !font-normal`} onClick={() => setQ(p.email)} aria-label={`Threads with ${p.name ?? p.email}`}>
                    <span className="text-body text-trs-ink">{p.name ?? p.email}</span>
                    <span className="text-small text-trs-muted">{p.email} · {p.threads} thread{p.threads === 1 ? '' : 's'} · last {fmtDay(p.lastAt)}</span>
                  </Btn>
                </li>
              ))}
            </Group>
          )}
          {found && found.companies.length > 0 && (
            <Group title="Companies">
              {found.companies.map(c => <li key={c.id}><Link href={`/companies/${c.id}`} onClick={() => onOpenChange(false)} className={rowCls}><span className="text-body">{c.name}</span>{c.kind && c.kind !== 'client' && <span className="text-small text-trs-muted">{c.kind.replace(/^\w/, x => x.toUpperCase())}</span>}</Link></li>)}
            </Group>
          )}
          {found && found.files.length > 0 && (
            <Group title="Files">
              {found.files.map(f => (
                <li key={`${f.threadId}|${f.filename}`}>
                  {f.canOpen && f.attachmentId
                    ? <a href={`/api/engagement/attachments/${encodeURIComponent(f.attachmentId)}/download`} target="_blank" rel="noopener noreferrer" className={rowCls}><span className="text-body">{f.filename}</span><span className="text-small text-trs-muted">{f.subject} · {fmtDay(f.lastAt)}</span></a>
                    : <Btn level="tertiary" className={`${rowCls} !h-auto !justify-start !font-normal`} onClick={() => void openThread({ threadId: f.threadId, canOpen: f.canOpen, owner: f.owner })}>
                        <span className="text-body text-trs-ink">{f.filename}</span><span className="text-small text-trs-muted">{f.subject} · {fmtDay(f.lastAt)}</span>
                      </Btn>}
                </li>
              ))}
            </Group>
          )}
          {nothing && <li className="px-2.5 py-3 text-body text-trs-muted">Nothing found for “{q.trim()}”.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
