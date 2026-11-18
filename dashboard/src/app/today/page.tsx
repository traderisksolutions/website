'use client'

/**
 * Today: the clients a person is working on, added by hand from their email threads, with every
 * unsent email on those threads split into To client and To insurer. Clear it top to bottom: read,
 * edit, send. By client groups the emails per client; By email lists them oldest first. The earlier
 * case list lives at /today/queue; its old links (?view=, ?bridge=) are sent there.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Btn, Chip, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { AddThreads } from '@/components/today/desk/AddThreads'
import { ClientRow } from '@/components/today/desk/ClientRow'
import { DraftCard, sendDraft } from '@/components/today/desk/DraftCard'
import { timeAgo } from '@/lib/format'
import { emailList, type DeskRow } from '@/lib/today/desk'

type View = 'client' | 'email'
type Desk = { rows: DeskRow[]; owners: string[]; me: string; who: string }
const OLD_PARAMS = ['view', 'bridge', 'level', 'side']
const firstName = (email: string) => { const f = email.split('@')[0].split(/[._]/)[0]; return f.charAt(0).toUpperCase() + f.slice(1) }

export default function TodayRoute() {
  return <Suspense fallback={null}><TodayPage /></Suspense>
}

function TodayPage() {
  const router = useRouter()
  const params = useSearchParams()
  const old = OLD_PARAMS.some(p => params.has(p))
  const [desk, setDesk] = useState<Desk | null>(null)
  const [who, setWho] = useState<string | null>(null)
  const [view, setView] = useState<View>('client')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [suggestCount, setSuggestCount] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (old) router.replace(`/today/queue?${params.toString()}`) }, [old, params, router])

  const load = useCallback(() => {
    const q = who ? `?who=${encodeURIComponent(who)}` : ''
    callApi<Desk>(`/api/today/desk${q}`).then(d => {
      setDesk(d)
      // The first time, open the client at the top so the page shows what a row holds.
      setOpen(o => (o.size || !d.rows[0] ? o : new Set([d.rows[0].key])))
    }).catch(e => setError(errText(e)))
  }, [who])
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

  if (old) return null
  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full max-w-[1320px] min-w-0">
      <PageHeader className="mb-5" title="Today"
        meta={desk ? `${rows.length} client${rows.length === 1 ? '' : 's'} · ${toClient} to client · ${emails.length - toClient} to insurer` : undefined}
        actions={<Btn level="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add email threads{suggestCount ? <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-trs-lime px-1.5 text-[11.5px] font-semibold text-trs-green" aria-label={`${suggestCount} suggested`}>{suggestCount}</span> : null}</Btn>}>
        <select aria-label="Whose Today" value={desk?.who ?? 'me'} onChange={e => setWho(e.target.value)} className="h-[30px] rounded-[8px] border border-trs-line-2 bg-white px-2 text-[13px] font-medium text-trs-ink">
          {people.map(p => <option key={p} value={p}>{firstName(p)}{p === me ? ' (me)' : ''}</option>)}
          <option value="all">Everyone</option>
        </select>
        <Segmented<View> value={view} onChange={setView} label="View" options={[{ value: 'client', label: 'By client', count: rows.length }, { value: 'email', label: 'By email', count: emails.length }]} />
        {view === 'client' && rows.length > 0 && <Btn size="xs" level="tertiary" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map(r => r.key)))}>{allOpen ? 'Fold all' : 'Unfurl all'}</Btn>}
      </PageHeader>

      {error && <p className="m-0 mb-3 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      {notice && <p className="m-0 mb-3 text-[13.5px] text-trs-ink" role="status">{notice}</p>}

      {!desk ? <Spinner label="Loading Today…" />
        : rows.length === 0 ? <Empty>No clients on this list. Add email threads to start.</Empty>
          : view === 'client' ? (
            <div className="flex flex-col gap-3.5">
              {rows.map(r => (
                <ClientRow key={r.key} row={r} me={me} showOwner={desk.who === 'all'} open={open.has(r.key)}
                  onToggle={() => setOpen(o => { const n = new Set(o); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })}
                  onChange={load} onNotice={setNotice} />
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
                    <td><Chip tone={d.side === 'insurer' ? 'green' : 'blue'}>{d.side === 'insurer' ? 'To insurer' : 'To client'}</Chip></td>
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
                  <tr><td colSpan={6} className="!text-left !h-auto bg-trs-tint p-3">
                    <DraftCard draft={d} startEditing onSent={to => { setEditing(null); onDone(`Sent to ${to}.`) }} onDiscarded={() => { setEditing(null); onDone('Email discarded.') }} />
                  </td></tr>
                )} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FragmentRow({ row, detail, open }: { row: React.ReactNode; detail: React.ReactNode; open: boolean }) {
  return <>{row}{open && detail}</>
}
