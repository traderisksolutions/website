'use client'

/**
 * One case, ready to approve: the draft on the left (editable), its paired draft below it (the
 * client update beside an insurer chase, or "tell the client it was lodged" beside a forward),
 * and on the right the case, its timeline, the threads and data-room files it rests on, and the
 * client's contacts on file. Send sends every ticked draft through /api/email/send, records the
 * send on the case, and moves to the next item on Today.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Btn, Chip, Spinner } from '@/components/crm/primitives'
import { ActionBar } from '@/components/ui/action-bar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { callApi, errText } from '@/components/placement/shared'
import { CASE_TYPE, STATUS, LaterMenu, ThreadModal, DocModal, fmtDate, fmtWhen } from '@/components/assistant/shared'
import { CaseEditor, AttachmentPicker } from '@/components/assistant/CaseEditor'
import type { ItemDetail, TodayDraft, TodayItem } from '@/lib/today/data'

type Staff = { email: string; name: string }
type Edit = { to: string; cc: string; subject: string; body: string }
const asEdit = (d: TodayDraft): Edit => ({ to: d.to, cc: d.cc ?? '', subject: d.subject, body: d.body })
const changed = (a: Edit, d: TodayDraft) => a.to !== d.to || a.cc !== (d.cc ?? '') || a.subject !== d.subject || a.body !== d.body
const inputCls = 'w-full min-w-0 h-9 rounded-[7px] border border-trs-line-2 bg-white px-3 text-[14px] text-trs-ink outline-none focus:border-trs-ink'
/** The send route attaches only what the request names: every file on the draft that has a reference. */
const withRefs = (a: TodayDraft['attachments']) => a.filter(x => x.storage_url).map(x => ({ filename: x.filename, mime_type: x.mime_type ?? undefined, storage_url: x.storage_url as string }))

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [main, setMain] = useState<Edit | null>(null)
  const [pairs, setPairs] = useState<Record<string, Edit>>({})
  const [include, setInclude] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [thread, setThread] = useState<string | null>(null)
  const [doc, setDoc] = useState<{ title: string; drive_url: string | null } | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    setItem(null); setError(null)
    callApi<{ item: ItemDetail; staff: Staff[] }>(`/api/today/${id}`).then(d => {
      setItem(d.item); setStaff(d.staff)
      setMain(d.item.draft ? asEdit(d.item.draft) : null)
      setPairs(Object.fromEntries(d.item.paired.map(p => [p.id, asEdit(p)])))
      setInclude(Object.fromEntries(d.item.paired.map(p => [p.id, true])))
    }).catch(e => setError(errText(e)))
  }, [id])
  useEffect(() => { load() }, [load])

  const forward = item?.draft?.kind === 'forward_to_insurer'
  const sending = (item?.draft ? 1 : 0) + (item?.paired.filter(p => include[p.id]).length ?? 0)
  const timeline = useMemo(() => {
    if (!item) return []
    return [
      ...item.events.map(e => ({ at: e.at, text: eventText(e.kind, e.actor, e.detail), links: [] as { label: string; url: string }[] })),
      ...item.ledger.map(l => ({ at: l.at, text: l.title, links: l.links })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14)
  }, [item])

  async function next() {
    const d = await callApi<{ items: TodayItem[] }>('/api/today').catch(() => ({ items: [] as TodayItem[] }))
    const n = d.items.find(i => i.id !== id && i.group !== 'later')
    router.push(n ? `/today/${n.id}` : '/today')
  }

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label); setError(null)
    try { setNotice(await fn()) } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  const work = (body: unknown) => callApi<{ draftId?: string }>(`/api/work/${id}`, { method: 'POST', body })

  async function saveAll() {
    if (!item) return
    if (item.draft && main && changed(main, item.draft)) await work({ action: 'edit_draft', to: main.to, cc: main.cc || null, subject: main.subject, body: main.body })
    for (const p of item.paired) {
      const e = pairs[p.id]
      if (e && changed(e, p)) await callApi(`/api/drafts/${p.id}`, { method: 'PATCH', body: { to: e.to, cc: e.cc || null, subject: e.subject, body: e.body } })
    }
  }

  const send = () => run('send', async () => {
    if (!item?.draft) throw new Error('There is no draft to send.')
    await saveAll()
    const sent: string[] = []
    const { draftId } = await work({ action: 'prepare_send' })
    await callApi('/api/email/send', { method: 'POST', body: { draftId, attachments: withRefs(item.draft.attachments) } })
    sent.push(item.draft.to)
    for (const p of item.paired.filter(x => include[x.id])) {
      try {
        const { draftId: pid } = await callApi<{ draftId: string }>(`/api/drafts/${p.id}`, { method: 'POST', body: { action: 'prepare' } })
        await callApi('/api/email/send', { method: 'POST', body: { draftId: pid, attachments: withRefs(p.attachments) } })
        sent.push(p.to)
      } catch (e) {
        // The main email is out; say exactly which one did not go.
        await work({ action: 'sent' })
        throw new Error(`Sent to ${sent.join(', ')}. Not sent to ${p.to}: ${errText(e)}`)
      }
    }
    await work({ action: 'sent' })
    await next()
    return `Sent ${sent.length} email${sent.length === 1 ? '' : 's'}.`
  })

  if (error && !item) return <div className="px-4 md:px-8 py-6 max-w-[1180px] mx-auto"><p className="m-0 text-[14px] text-trs-neg">{error}</p><Link href="/today" className="text-[13.5px]">Back to Today</Link></div>
  if (!item) return <div className="px-4 md:px-8 py-6"><Spinner label="Loading the case…" /></div>

  const st = STATUS[item.status] ?? STATUS.trs_to_act
  const title = forward && item.insurer_name ? `Forward to ${item.insurer_name}` : item.title
  const facts = [item.client, item.insurer_name, CASE_TYPE[item.case_type] ?? item.case_type, item.policy_number, item.waiting_since ? `waiting since ${fmtDate(item.waiting_since)}` : null].filter(Boolean).join(' · ')

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1180px] mx-auto w-full min-w-0 flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[28px] font-medium tracking-[-0.02em] leading-[1.15] text-trs-ink [text-wrap:balance]">{title}</h1>
          <div className="mt-1 text-[13.5px] text-trs-muted">{forward ? `${item.title} · ${facts}` : facts}</div>
        </div>
        <Link href="/today" className="text-[13.5px] text-trs-muted no-underline hover:underline">Back to Today</Link>
      </header>
      {notice && <p className="m-0 text-[13.5px] text-trs-ink" role="status">{notice}</p>}
      {error && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start">
        <section className="rounded-[10px] border border-trs-line bg-white min-w-0 flex flex-col" aria-label="Draft">
          {item.needs_human && (
            <div className="px-4 py-3 border-b border-trs-line">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-trs-neg">Decision</div>
              <p className="m-0 mt-1 text-[14px] text-trs-ink">{item.needs_human}</p>
            </div>
          )}
          {item.draft && main ? <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-trs-line">
              <Chip tone="neutral">{forward ? 'Forward to insurer' : partyLabel(item.draft.party, 'Reply')}</Chip>
              <span className="text-[12px] text-trs-muted">Signed with your name on send</span>
            </div>
            <DraftFields value={main} onChange={setMain} files={item.draft.attachments.map(a => a.filename)}
              picker={<AttachmentPicker itemId={item.id} draftId={item.draft.id} files={item.draft.attachments.map(a => a.filename)} documents={item.documents} onChanged={() => { setNotice('Attachments updated.'); load() }} onError={setError} />} />
            {item.paired.map(p => (
              <div key={p.id} className="border-t border-trs-line">
                <label className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-[13.5px] text-trs-ink">
                  <input type="checkbox" checked={!!include[p.id]} onChange={e => setInclude(s => ({ ...s, [p.id]: e.target.checked }))} />
                  {forward && p.party === 'client' ? 'Tell the client it was lodged' : `Also update the ${p.party === 'insurer' ? 'insurer' : 'client'}`}
                </label>
                {include[p.id] && pairs[p.id] && <DraftFields value={pairs[p.id]} onChange={v => setPairs(s => ({ ...s, [p.id]: v }))} files={p.attachments.map(a => a.filename)} compact
                  picker={<AttachmentPicker itemId={item.id} draftId={p.id} files={p.attachments.map(a => a.filename)} documents={item.documents} onChanged={() => { setNotice('Attachments updated.'); load() }} onError={setError} />} />}
              </div>
            ))}
          </> : (
            <div className="px-4 py-4 text-[14px] text-trs-ink-2 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5"><Chip tone={st.tone}>{st.label}</Chip></div>
              {item.next_action ? <p className="m-0">{item.next_action}</p> : <p className="m-0 text-trs-muted">No draft on this case.</p>}
            </div>
          )}
          <ActionBar left={<>
            <LaterMenu itemId={item.id} label="Come back later" size="sm" onSet={l => { setNotice(`${l}.`); void next() }} onError={setError} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Btn level="tertiary">Reassign</Btn></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {staff.map(s => <DropdownMenuItem key={s.email} onSelect={() => void run('assign', async () => { await work({ action: 'assign', owner: s.email }); load(); return `Assigned to ${s.name}.` })}>{s.name}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          </>}>
            {item.draft
              ? <>
                  <Btn disabled={busy !== null} loading={busy === 'save'} onClick={() => void run('save', async () => { await saveAll(); load(); return 'Draft saved.' })}>Save draft</Btn>
                  <Btn level="primary" disabled={busy !== null} loading={busy === 'send'} onClick={() => void send()}>
                    {forward && item.insurer_name ? `Forward to ${item.insurer_name}` : `Send ${sending} email${sending === 1 ? '' : 's'}`}
                  </Btn>
                </>
              : <Btn level="primary" disabled={busy !== null} loading={busy === 'close'} onClick={() => void run('close', async () => { await work({ action: 'close' }); await next(); return 'Closed.' })}>Mark done</Btn>}
          </ActionBar>
        </section>

        <aside className="flex flex-col gap-3 min-w-0">
          <Card title="Case" action={<Btn size="xs" level={editing ? 'secondary' : 'tertiary'} onClick={() => setEditing(v => !v)}>{editing ? 'Close editor' : 'Edit'}</Btn>}>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone={st.tone}>{st.label}</Chip>
              <Chip>{CASE_TYPE[item.case_type] ?? item.case_type}</Chip>
              {item.deadline && <Chip tone="amber">Due {fmtDate(item.deadline)}</Chip>}
              {(item.pending.level === 'red' || item.pending.level === 'amber') && <Chip tone={item.pending.level === 'red' ? 'red' : 'amber'}>{item.pending.reason}{item.pending.override ? ' · set by a person' : ''}</Chip>}
              {item.owner_email && <Chip>{item.owner_email.split('@')[0]}</Chip>}
            </div>
            {editing && <CaseEditor item={item} onSaved={m => { setNotice(m); setError(null); setEditing(false); load() }} onError={setError} />}
            {item.summary && <p className="m-0 text-[13.5px] text-trs-ink-2">{item.summary}</p>}
            {timeline.length > 0 && (
              <ol className="m-0 p-0 list-none flex flex-col gap-1.5 text-[13px]">
                {timeline.map((t, n) => (
                  <li key={n} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                    <span className="font-mono text-[11.5px] text-trs-muted pt-[2px]">{fmtWhen(t.at)}</span>
                    <span className="text-trs-ink-2 min-w-0 break-words">{t.text}{t.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="ml-1.5 text-trs-muted">{l.label}</a>)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Source">
            {item.threads.length === 0 && item.documents.length === 0 && <p className="m-0 text-[13px] text-trs-muted">No threads or files linked.</p>}
            {item.threads.map(t => (
              <button key={t.id} type="button" onClick={() => setThread(t.id)}
                className="text-left w-full min-w-0 rounded-[7px] border border-trs-line-2 bg-white px-2.5 py-1.5 text-[13px] text-trs-ink cursor-pointer hover:border-trs-ink-2">
                <span className="block truncate">{t.subject ?? 'Thread'}</span>
                <span className="block text-[12px] text-trs-muted">{t.side === 'insurer' ? 'Insurer' : t.side === 'client' ? 'Client' : 'Other'} · {t.messages} email{t.messages === 1 ? '' : 's'}{t.joined_by ? ` · joined by ${t.joined_by.replace('_', ' ')}` : ''}</span>
              </button>
            ))}
            {item.documents.slice(0, 8).map(d => (
              <button key={d.id} type="button" onClick={() => setDoc({ title: d.title, drive_url: d.drive_url })}
                className="text-left w-full min-w-0 rounded-[7px] border border-trs-line-2 bg-white px-2.5 py-1.5 text-[13px] text-trs-ink cursor-pointer hover:border-trs-ink-2">
                <span className="block truncate">{d.title}</span>
                <span className="block text-[12px] text-trs-muted">Data room · {d.doc_type.replace(/_/g, ' ')}{d.received_at ? ` · ${fmtDate(d.received_at)}` : ''}</span>
              </button>
            ))}
          </Card>
          {item.contacts.length > 0 && (
            <Card title="Client contacts on file">
              <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13px]">
                {item.contacts.map(c => <li key={c.email} className="min-w-0"><span className="text-trs-ink">{c.name}</span> <span className="text-trs-muted break-all">{c.email}</span>{c.scope.length > 0 && <span className="text-trs-muted"> · {c.scope.join(', ').replace(/_/g, ' ')}</span>}</li>)}
              </ul>
            </Card>
          )}
        </aside>
      </div>

      <ThreadModal threadId={thread} onClose={() => setThread(null)} />
      <DocModal doc={doc} onClose={() => setDoc(null)} />
    </div>
  )
}

function DraftFields({ value, onChange, files, compact, picker }: { value: Edit; onChange: (v: Edit) => void; files: string[]; compact?: boolean; picker?: React.ReactNode }) {
  const set = (k: keyof Edit) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="flex flex-col">
      {(['to', 'cc', 'subject'] as const).map(k => (
        <label key={k} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 px-4 py-1.5 border-b border-trs-line text-[12.5px] text-trs-muted">
          {k === 'to' ? 'To' : k === 'cc' ? 'Cc' : 'Subject'}
          <input className={inputCls} value={value[k]} onChange={set(k)} />
        </label>
      ))}
      <textarea aria-label="Message" value={value.body} onChange={set('body')} rows={compact ? 6 : 12}
        className="block w-full border-0 px-4 py-3 text-[14px] leading-relaxed text-trs-ink outline-none resize-y bg-white font-sans" />
      {picker ?? (files.length > 0 && <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-t border-trs-line text-[12.5px] text-trs-muted">Attached {files.map(f => <Chip key={f}>{f}</Chip>)}</div>)}
    </div>
  )
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-trs-line bg-white px-4 py-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2"><h2 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-trs-muted">{title}</h2>{action}</div>
      {children}
    </section>
  )
}

function partyLabel(party: string | null, fallback: string) {
  return party === 'insurer' ? 'To insurer' : party === 'client' ? 'To client' : fallback
}

function eventText(kind: string, actor: string, d: Record<string, any>): string {
  const who = actor.includes('@') ? actor.split('@')[0] : actor.replace(/_/g, ' ')
  switch (kind) {
    case 'sent': return `Sent by ${who}`
    case 'draft': return d.discarded ? `Draft discarded by ${who}` : d.edited ? `Draft edited by ${who}` : `Draft written by ${who}`
    case 'owner': return `Assigned to ${String(d.owner ?? '').split('@')[0]}`
    case 'later': return d.choice ? `Set for later by ${who}` : `Brought back by ${who}`
    case 'seen': return `Read by ${who}`
    case 'edit': return d.attachments ? `Attachments changed by ${who}` : `Edited by ${who}: ${Object.keys(d.changes ?? {}).map(k => k.replace(/_/g, ' ')).join(', ')}`
    case 'closed': return `Closed by ${who}`
    case 'reopened': return `Reopened by ${who}`
    case 'read': return `Case read by ${who}${d.status ? ` · ${String(d.status).replace(/_/g, ' ')}` : ''}`
    case 'note': return d.opened ? `Opened ${String(d.opened).replace(/_/g, ' ')}` : `Note by ${who}`
    default: return `${kind.replace(/_/g, ' ')} · ${who}`
  }
}
