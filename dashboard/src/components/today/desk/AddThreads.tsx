'use client'

/**
 * Add email threads: tick Inbox threads, say for each whether it is with the client or an insurer,
 * and which client it is about. Nothing else joins Today; every add and remove is kept, so a later
 * version can learn which threads people put here and suggest them.
 */
import { useEffect, useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Btn, InlineSpinner, Spinner, inputCls } from '@/components/crm/primitives'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { callApi, errText } from '@/components/placement/shared'
import { fmtDay } from '@/lib/format'
import { participantsLine, type DeskSide, type Participant } from '@/lib/today/desk'
import type { Suggestion } from '@/lib/today/learn-server'

type Conv = { thread_id: string; subject: string | null; display_subject: string | null; snippet: string | null; match?: string | null; first_name: string | null; last_name: string | null; email: string | null; companyId: string | null; companyName: string | null; companyKind: string | null; clientCompanyId: string | null; created_at: string; last_message_at?: string | null; participants?: Participant[] }
type Pick = { side: DeskSide; client: CompanyPick }

const subjectOf = (c: Conv) => c.display_subject || c.subject || '(no subject)'
/** Every word of the search, in any order. */
const hasWords = (xs: (string | null | undefined)[], t: string) => { const text = xs.filter(Boolean).join(' ').toLowerCase(); return t.split(/\s+/).every(w => text.includes(w)) }
const senderOf = (c: Conv) => [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown sender'
const selCls = 'h-9 rounded-[8px] border border-trs-line-2 bg-white px-2 text-[13.5px] text-trs-ink'

export function AddThreads({ taken, onClose, onAdded }: { taken: Set<string>; onClose: () => void; onAdded: (n: number) => void }) {
  const [convs, setConvs] = useState<Conv[] | null>(null)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Map<string, Pick>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<Suggestion[] | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    callApi<{ suggestions: Suggestion[] }>('/api/today/desk/suggest').then(r => setSuggested(r.suggestions)).catch(() => setSuggested([]))
  }, [])
  async function takeSuggestion(g: Suggestion, act: 'add' | 'dismiss') {
    setActing(`${act}:${g.threadId}`); setError(null)
    try {
      if (act === 'add') await callApi('/api/today/desk', { method: 'POST', body: { action: 'add', threads: [{ threadId: g.threadId, side: g.side, companyId: g.companyId }] } })
      else await callApi('/api/today/desk', { method: 'POST', body: { action: 'dismiss', threadId: g.threadId } })
      setSuggested(list => (list ?? []).filter(x => x.threadId !== g.threadId))
      if (act === 'add') setAddedHere(n => n + 1)
    } catch (e) { setError(errText(e)) } finally { setActing(null) }
  }
  const [addedHere, setAddedHere] = useState(0)

  useEffect(() => { void (async () => {
    const r = await fetch('/api/engagement/conversations?people=1', { cache: 'no-store' })
    const j = await r.json().catch(() => [])
    setConvs(Array.isArray(j) ? j : [])
  })() }, [])
  // The server's search of every thread and every email in it, fetched once typing pauses.
  // Names, every address and the text of every email are searched (body=1: a few seconds).
  const [found, setFound] = useState<Conv[]>([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setFound([]); setSearching(false); return }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true)
      fetch(`/api/engagement/conversations?q=${encodeURIComponent(t)}&body=1&people=1`, { cache: 'no-store', signal: ctl.signal })
        .then(r => r.json()).then(j => { setFound(Array.isArray(j) ? j : []); setSearching(false) }).catch(() => {})
    }, 350)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [q])

  const nameOf = useMemo(() => new Map((convs ?? []).filter(c => c.companyId && c.companyName).map(c => [c.companyId!, c.companyName!])), [convs])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    // The server's matches first (they carry the email that matched), then the newest threads.
    const seen = new Set(found.map(c => c.thread_id))
    const all = [...found, ...(convs ?? []).filter(c => !seen.has(c.thread_id))]
      .sort((a, b) => String(b.last_message_at ?? b.created_at).localeCompare(String(a.last_message_at ?? a.created_at)))
    return all.filter(c => !taken.has(c.thread_id))
      .filter(c => !t || seen.has(c.thread_id) || hasWords([subjectOf(c), c.subject, senderOf(c), c.email, c.companyName, c.snippet, ...(c.participants ?? []).flatMap(p => [p.name, p.email])], t)).slice(0, 200)
  }, [convs, found, q, taken])

  function toggle(c: Conv) {
    setPicked(p => {
      const n = new Map(p)
      if (n.has(c.thread_id)) { n.delete(c.thread_id); return n }
      const side: DeskSide = c.companyKind === 'insurer' ? 'insurer' : 'client'
      const clientId = side === 'insurer' ? c.clientCompanyId : c.companyId
      n.set(c.thread_id, { side, client: clientId ? { id: clientId, name: (side === 'insurer' ? nameOf.get(clientId) : c.companyName) ?? '' } : { id: null, name: '' } })
      return n
    })
  }
  const set = (id: string, f: (p: Pick) => Pick) => setPicked(p => { const n = new Map(p); const cur = n.get(id); if (cur) n.set(id, f(cur)); return n })

  async function add() {
    setBusy(true); setError(null)
    try {
      const threads = [...picked].map(([threadId, p]) => ({ threadId, side: p.side, companyId: p.client.id }))
      const r = await callApi<{ added: number }>('/api/today/desk', { method: 'POST', body: { action: 'add', threads } })
      onAdded(r.added + addedHere)
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const clients = new Set([...picked.values()].map(p => p.client.id ?? p.client.name).filter(Boolean)).size

  return (
    <DialogPrimitive.Root open onOpenChange={o => { if (!o) { if (addedHere) onAdded(addedHere); else onClose() } }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="trs-modal-overlay fixed inset-0 z-[100]" />
        <DialogPrimitive.Content aria-describedby={undefined} className="trs-modal-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100vh-48px)] w-[min(980px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[28px] bg-white px-6 md:px-8 pt-7 pb-6 shadow-[0_30px_80px_rgba(15,20,18,0.25)] focus:outline-none">
          <DialogPrimitive.Close aria-label="Close" className="absolute right-[18px] top-[18px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-[#e8e8ed] text-[#3a3a3c] cursor-pointer"><X size={16} /></DialogPrimitive.Close>
          <DialogPrimitive.Title className="m-0 pr-10 text-[22px] font-semibold tracking-[-0.02em] text-trs-ink">Add email threads</DialogPrimitive.Title>
          {suggested && suggested.length > 0 && (
            <section aria-label="Suggested" className="flex flex-col gap-1.5">
              <span className="self-start rounded-full bg-trs-mint px-2.5 py-[2px] text-[12px] font-semibold text-trs-green">Suggested · {suggested.length}</span>
              <div className="max-h-[220px] overflow-auto rounded-[10px] border border-trs-line-2">
                <table className="trs-table min-w-[760px]">
                  <thead><tr><th>Thread</th><th className="w-[160px]">Client</th><th className="w-[90px]">Side</th><th className="w-[240px]">Reason</th><th className="w-[150px]">Action</th></tr></thead>
                  <tbody>
                    {suggested.map(g => (
                      <tr key={g.threadId}>
                        <td className="cell-left !text-left"><div className="font-medium text-trs-ink">{g.subject}</div><div className="text-[12px] text-trs-muted">{fmtDay(g.lastAt)}</div></td>
                        <td>{g.companyName ?? '—'}</td>
                        <td>{g.side === 'insurer' ? 'Insurer' : 'Client'}</td>
                        <td className="!text-left text-[12.5px] text-trs-ink-2">{g.reason}</td>
                        <td>
                          <span className="inline-flex gap-1.5">
                            <Btn size="xs" level="tertiary" onClick={() => takeSuggestion(g, 'dismiss')} loading={acting === `dismiss:${g.threadId}`} disabled={!!acting}>Dismiss</Btn>
                            <Btn size="xs" onClick={() => takeSuggestion(g, 'add')} loading={acting === `add:${g.threadId}`} disabled={!!acting}>Add</Btn>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <input type="search" aria-label="Search threads" placeholder="Search subject, people, company or email text" value={q} onChange={e => setQ(e.target.value)} className={inputCls} autoFocus />
          {searching && <InlineSpinner label="Searching every email…" />}
          <div className="min-h-0 flex-1 overflow-auto rounded-[10px] border border-trs-line-2">
            {!convs ? <Spinner label="Loading threads…" /> : shown.length === 0 ? <p className="m-0 p-6 text-center text-[13.5px] text-trs-muted">No threads match.</p> : (
              <table className="trs-table min-w-[760px]">
                <thead><tr><th className="w-10"><span className="sr-only">Add</span></th><th>Thread</th><th className="w-[92px]">Last</th><th className="w-[230px]">Client</th><th className="w-[130px]">Side</th></tr></thead>
                <tbody>
                  {shown.map(c => {
                    const p = picked.get(c.thread_id)
                    return (
                      <tr key={c.thread_id} aria-selected={!!p}>
                        <td><input type="checkbox" aria-label={`Add ${subjectOf(c)}`} checked={!!p} onChange={() => toggle(c)} /></td>
                        <td className="cell-left !text-left">
                          <div className="font-medium text-trs-ink">{subjectOf(c)}</div>
                          <div className="text-[12px] text-trs-muted">{senderOf(c)}{c.companyName ? ` · ${c.companyName}` : ''}</div>
                          {c.participants && c.participants.length > 0 && (() => { const p = participantsLine(c.participants); return <div className="text-[12px] text-trs-ink-2" title={p.full}>{p.text}{p.more ? ` +${p.more}` : ''}</div> })()}
                          {c.match && q.trim() && <div className="text-[12px] text-trs-subtle">Matched: {c.match}</div>}
                        </td>
                        <td className="font-mono text-[12px] text-trs-muted">{fmtDay(c.last_message_at ?? c.created_at)}</td>
                        <td className="!text-left">{p ? <CompanyField label="" value={p.client} onChange={v => set(c.thread_id, x => ({ ...x, client: v }))} listId={`client-${c.thread_id}`} /> : <span className="text-[12.5px] text-trs-subtle">{c.companyKind === 'insurer' ? '' : c.companyName ?? ''}</span>}</td>
                        <td>{p ? (
                          <select aria-label="Side" value={p.side} onChange={e => set(c.thread_id, x => ({ ...x, side: e.target.value as DeskSide }))} className={selCls}>
                            <option value="client">Client</option>
                            <option value="insurer">Insurer</option>
                          </select>
                        ) : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {error && <p className="m-0 text-[13px] text-trs-neg" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-trs-muted">{picked.size} thread{picked.size === 1 ? '' : 's'} · {clients} client{clients === 1 ? '' : 's'}</span>
            <div className="flex gap-2">
              <Btn onClick={() => (addedHere ? onAdded(addedHere) : onClose())} disabled={busy}>{addedHere ? 'Done' : 'Cancel'}</Btn>
              <Btn level="primary" onClick={add} loading={busy} disabled={busy || picked.size === 0}>Add to Today</Btn>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
