'use client'

/**
 * Today: the clients a person is working on, added by hand from their email threads, with every
 * unsent email on those threads split into To client and To insurer. Clear it top to bottom: read,
 * edit, send. By client groups the emails per client; By email lists them oldest first.
 * ?client=<company id> opens that client (the case page's Done returns here with it). Links from the
 * retired case list (?view=, ?bridge=, ?level=, ?side=) land on Today itself.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Plus } from 'lucide-react'
import { Btn, Chip, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { callApi, errText } from '@/components/placement/shared'
import { AddThreads } from '@/components/today/desk/AddThreads'
import { ClientRow } from '@/components/today/desk/ClientRow'
import { DraftCard, sendDraft } from '@/components/today/desk/DraftCard'
import { timeAgo } from '@/lib/format'
import { emailList, type DeskRow } from '@/lib/today/desk'

type View = 'client' | 'email'
type Desk = { rows: DeskRow[]; owners: string[]; me: string; who: string; projects?: boolean }
const OLD_PARAMS = ['view', 'bridge', 'level', 'side']
const firstName = (email: string) => { const f = email.split('@')[0].split(/[._]/)[0]; return f.charAt(0).toUpperCase() + f.slice(1) }

export default function TodayRoute() {
  return <Suspense fallback={null}><TodayPage /></Suspense>
}

function TodayPage() {
  const router = useRouter()
  const params = useSearchParams()
  const old = OLD_PARAMS.some(p => params.has(p))
  const client = params.get('client')
  const [desk, setDesk] = useState<Desk | null>(null)
  const [who, setWho] = useState<string | null>(null)
  const [view, setView] = useState<View>('client')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [suggestCount, setSuggestCount] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (old) router.replace('/today') }, [old, router])

  const load = useCallback(() => {
    const q = who ? `?who=${encodeURIComponent(who)}` : ''
    setError(null)
    callApi<Desk>(`/api/today/desk${q}`).then(d => {
      setDesk(d)
      // The first time, open the client asked for (?client=), else the client at the top.
      const asked = client ? d.rows.filter(r => r.companyId === client).map(r => r.key) : []
      setOpen(o => (o.size ? o : asked.length ? new Set(asked) : d.rows[0] ? new Set([d.rows[0].key]) : o))
    }).catch(e => setError(errText(e)))
  }, [who, client])
  const retry = () => { setDesk(null); load() }
  useEffect(() => { if (!old) load() }, [load, old])
  // Suggestions are code-scored (no model): safe to count on load.
  useEffect(() => { if (!old && !adding) callApi<{ suggestions: unknown[] }>('/api/today/desk/suggest').then(r => setSuggestCount(r.suggestions.length)).catch(() => setSuggestCount(null)) }, [old, adding])

  const rows = useMemo(() => desk?.rows ?? [], [desk])
  const emails = useMemo(() => emailList(rows), [rows])
  const toClient = emails.filter(d => d.side === 'client').length
  const me = desk?.me ?? ''
  const people = useMemo(() => Array.from(new Set([me, ...(desk?.owners ?? [])].filter(Boolean))), [desk, me])
  const allOpen = rows.length > 0 && rows.every(r => open.has(r.key))
  const taken = useMemo(() => new Set(rows.filter(r => r.owner === me).flatMap(r => r.threads.map(t => t.threadId))), [rows, me])
  const done = (m: string) => { setNotice(m); setError(null); load() }
  // Scroll to the client asked for, once the rows are on the page.
  const hasDesk = !!desk
  useEffect(() => {
    if (!client || !hasDesk) return
    document.querySelector(`[data-company="${CSS.escape(client)}"]`)?.scrollIntoView({ block: 'start' })
  }, [client, hasDesk])

  if (old) return null
  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full max-w-[1320px] min-w-0">
      <PageHeader className="mb-5" title="Today"
        meta={desk ? `${rows.length} client${rows.length === 1 ? '' : 's'} · ${toClient} to client · ${emails.length - toClient} to insurer` : undefined}
        actions={<Btn level="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add email threads{suggestCount ? <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-trs-lime px-1.5 text-[11.5px] font-semibold text-trs-green" aria-label={`${suggestCount} suggested`}>{suggestCount}</span> : null}</Btn>}>
        <WhoMenu people={people} me={me} value={desk?.who ?? me} onChange={setWho} />
        <Segmented<View> variant="tabs" value={view} onChange={setView} label="View" options={[{ value: 'client', label: 'By client', count: rows.length }, { value: 'email', label: 'By email', count: emails.length }]} />
        {view === 'client' && rows.length > 0 && <Btn size="xs" level="secondary" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map(r => r.key)))}>{allOpen ? 'Fold all' : 'Unfurl all'}</Btn>}
      </PageHeader>

      {error && desk && <p className="m-0 mb-3 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      {notice && <p className="m-0 mb-3 text-[13.5px] text-trs-ink" role="status">{notice}</p>}

      {!desk ? (error
        ? <div role="alert" className="flex flex-col items-start gap-3 py-6"><p className="m-0 text-[13.5px] text-trs-neg">Today did not load. {error}</p><Btn onClick={retry}>Retry</Btn></div>
        : <Spinner label="Loading Today…" />)
        : rows.length === 0 ? <Empty>No clients on this list. Add email threads to start.</Empty>
          : view === 'client' ? (
            <div className="flex flex-col gap-7">
              {rows.map(r => (
                <ClientRow key={r.key} row={r} me={me} showOwner={desk.who === 'all'} open={open.has(r.key)}
                  onToggle={() => setOpen(o => { const n = new Set(o); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })}
                  onChange={load} onNotice={setNotice} projectsOn={!!desk.projects} />
              ))}
            </div>
          ) : <ByEmail emails={emails} onDone={done} />}

      {adding && <AddThreads taken={taken} onClose={() => setAdding(false)} onAdded={n => { setAdding(false); done(`${n} thread${n === 1 ? '' : 's'} added.`) }} />}
    </div>
  )
}

function ByEmail({ emails, onDone }: { emails: ReturnType<typeof emailList>; onDone: (m: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!emails.length) return <Empty>No emails to send. Open a client and Read to get suggestions.</Empty>
  async function send(d: (typeof emails)[number]) {
    setBusy(d.id); setError(null)
    try { await sendDraft(d, d); onDone(`Sent to ${d.to}.`) } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  return (
    <>
      {error && <p className="m-0 mb-3 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      <div className="overflow-x-auto rounded-[10px] border border-trs-line-2 bg-white">
        <table className="trs-table min-w-[980px]">
          <thead><tr><th className="sticky left-0 z-[1] bg-[#f0f2ee]">Client</th><th className="w-[110px]">Side</th><th className="w-[200px]">To</th><th>Subject</th><th className="w-[96px]">Drafted</th><th className="w-[150px]">Action</th></tr></thead>
          <tbody>
            {emails.map(d => (
              <FragmentRow key={d.id} open={editing === d.id}
                row={(
                  <tr>
                    <td className="cell-left !text-left sticky left-0 z-[1] bg-white font-medium">{d.companyName}</td>
                    <td><Chip>{d.side === 'insurer' ? 'To insurer' : 'To client'}</Chip></td>
                    <td className="!text-left truncate max-w-[200px]" title={d.to}>{d.person ?? d.to}</td>
                    <td className="!text-left truncate max-w-[420px]" title={d.subject}>{d.subject}</td>
                    <td className="font-mono text-[12px] text-trs-muted">{timeAgo(d.createdAt)}</td>
                    <td>
                      <span className="inline-flex gap-1.5">
                        <Btn size="xs" onClick={() => setEditing(e => (e === d.id ? null : d.id))} disabled={!!busy}>{editing === d.id ? 'Close' : 'Edit'}</Btn>
                        <Btn size="xs" level="primary" onClick={() => send(d)} loading={busy === d.id} disabled={!!busy || editing === d.id}>Send</Btn>
                      </span>
                    </td>
                  </tr>
                )}
                detail={(
                  <tr><td colSpan={6} className="!text-left !h-auto p-3">
                    <DraftCard draft={d} startEditing onSent={to => { setEditing(null); onDone(`Sent to ${to}.`) }} onDiscarded={() => { setEditing(null); onDone('Email discarded.') }}
                      onSaved={onDone} onRedone={m => { setEditing(null); onDone(m) }} />
                  </td></tr>
                )} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Whose Today: me, a colleague or everyone, as a menu button. */
function WhoMenu({ people, me, value, onChange }: { people: string[]; me: string; value: string; onChange: (v: string) => void }) {
  const label = value === 'all' ? 'Everyone' : `${firstName(value || me)}${value === me ? ' (me)' : ''}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Btn size="xs" level="secondary" aria-label={`Whose Today: ${label}`}>{label} <ChevronDown size={14} aria-hidden /></Btn>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {people.map(p => <DropdownMenuRadioItem key={p} value={p}>{firstName(p)}{p === me ? ' (me)' : ''}</DropdownMenuRadioItem>)}
          <DropdownMenuRadioItem value="all">Everyone</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FragmentRow({ row, detail, open }: { row: React.ReactNode; detail: React.ReactNode; open: boolean }) {
  return <>{row}{open && detail}</>
}
