'use client'

/**
 * One client on Today. Folded: per side, who the email is to, the project and the to-do (blank when
 * nothing waits). Open: the Read (summary, points, suggested emails to tick and draft), then the
 * threads and emails by project: threads without a project sit under the client, each project
 * below with its threads and its To client and To insurer emails. Read, Draft and Discard and redo
 * are the only model calls, each on its button.
 */
import Link from 'next/link'
import { useState } from 'react'
import { ChevronRight, ExternalLink, MessageSquare, Sparkles } from 'lucide-react'
import { Btn, Chip, inputCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { fmtDay, money, timeAgo } from '@/lib/format'
import type { ReadPlan } from '@/lib/chief/read'
import { foldSummary, groupProjects, projectNames, threadForStep, threadHref, type DeskDraft, type DeskRow, type DeskSide, type DeskThread, type FoldLine, type ProjectGroup } from '@/lib/today/desk'
import { DraftCard } from './DraftCard'
import { InlineConfirm } from './InlineConfirm'

const SIDE_LABEL: Record<DeskSide, string> = { client: 'To client', insurer: 'To insurer' }
const SIDE_TONE: Record<DeskSide, string> = { client: 'bg-trs-info-bg text-trs-info', insurer: 'bg-trs-select-bg text-trs-select-fg' }
const first = (s: string) => s.split(/[\s@]/)[0]

export function ClientRow({ row, open, onToggle, showOwner, me, onChange, onNotice, projectsOn = false }: {
  row: DeskRow; open: boolean; onToggle: () => void; showOwner: boolean; me: string
  onChange: () => void; onNotice: (m: string) => void
  /** The project columns exist (20261120_today_thread_project.sql applied). */
  projectsOn?: boolean
}) {
  const confirm = useConfirm()
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [read, setRead] = useState<ReadPlan | null>(row.read)
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const ids = row.threads.map(t => t.threadId)
  const base = { owner: row.owner, companyId: row.companyId, threadIds: ids }
  const mine = row.owner === me
  const groups = groupProjects(row)
  const hasProjects = groups.some(g => g.project)
  const projects = projectNames(row)

  async function doRead() {
    setBusy('read'); setError(null)
    try {
      const r = await callApi<{ read: ReadPlan }>('/api/today/desk', { method: 'POST', body: { action: 'read', ...base } })
      setRead(r.read)
      setTicked(new Set(r.read.steps.filter(s => s.kind === 'email' && s.status === 'proposed').map(s => s.id)))
      if (!open) onToggle()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function doDraft() {
    setBusy('draft'); setError(null)
    try {
      const r = await callApi<{ read: ReadPlan }>('/api/today/desk', { method: 'POST', body: { action: 'draft', ...base, stepIds: [...ticked] } })
      setRead(r.read); setTicked(new Set()); onChange()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function doStep(stepId: string, act: 'discard' | 'update' | 'done') {
    const step = read?.steps.find(s => s.id === stepId)
    const draft = row.drafts.find(d => d.id === step?.draftId)
    if (act === 'discard' && !(await confirm({ title: `Discard the email to ${draft?.person ?? draft?.to ?? 'this person'}?`, body: 'It will not be sent. The thread stays on Today.', action: 'Discard', danger: true }))) return
    setBusy(`step:${stepId}`); setError(null)
    try {
      const r = await callApi<{ read: ReadPlan }>('/api/today/desk', { method: 'POST', body: { action: 'step', ...base, stepId, act } })
      setRead(r.read)
      if (act !== 'done') { onNotice(act === 'discard' ? 'Email discarded.' : `Email to ${draft?.person ?? draft?.to ?? 'the person'} updated. Check it below, then Send.`); onChange() }
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function remove() {
    const n = row.drafts.length
    if (!(await confirm({ title: `Remove ${row.companyName}?`, body: `${row.threads.length} thread${row.threads.length === 1 ? '' : 's'}${n ? ` and ${n} unsent email${n === 1 ? '' : 's'}` : ''} leave your Today. The threads and drafts stay in the Inbox.`, action: 'Remove', danger: true }))) return
    setBusy('remove'); setError(null)
    try { await callApi('/api/today/desk', { method: 'POST', body: { action: 'remove', ...base } }); onNotice(`${row.companyName} removed from Today.`); onChange() }
    catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function removeThread(t: DeskThread) {
    setBusy(`thread:${t.threadId}`); setError(null)
    try { await callApi('/api/today/desk', { method: 'POST', body: { action: 'remove', owner: row.owner, companyId: row.companyId, threadIds: [t.threadId] } }); onNotice(`${t.subject} removed from Today.`); onChange() }
    catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function saveProject(t: DeskThread, project: string, note: string) {
    setBusy(`project:${t.threadId}`); setError(null)
    try {
      await callApi('/api/today/desk', { method: 'POST', body: { action: 'project', owner: row.owner, companyId: row.companyId, threadIds: [t.threadId], project, note } })
      onNotice(project.trim() ? `${t.subject} moved to ${project.trim()}.` : `${t.subject} moved under ${row.companyName}.`); onChange()
      return true
    } catch (e) { setError(errText(e)); return false } finally { setBusy(null) }
  }
  const saved = (m: string) => { onNotice(m); onChange() }
  const draftCard = (d: DeskDraft) => (
    <DraftCard key={d.id} draft={d} threads={ids}
      onSent={to => { onNotice(`Sent to ${to}.`); onChange() }}
      onDiscarded={() => { onNotice('Email discarded.'); onChange() }}
      onSaved={saved} onRedone={saved} />
  )
  const threadList = (ts: DeskThread[]) => (
    <ul className="m-0 list-none p-0 flex flex-col gap-1.5">
      {ts.map(t => (
        <ThreadLine key={t.threadId} t={t} mine={mine} projectsOn={projectsOn} projects={projects} busy={busy}
          onRemove={() => removeThread(t)} onProject={(p, n) => saveProject(t, p, n)} />
      ))}
    </ul>
  )
  const sideGrid = (g: ProjectGroup, emptyBoxes: boolean) => (
    <div className="grid grid-cols-1 md:grid-cols-2">
      {(['client', 'insurer'] as const).map(s => {
        const ds = g.drafts.filter(d => d.side === s)
        return (
          <div key={s} className={`flex min-w-0 flex-col gap-3 p-4 ${s === 'client' ? 'md:border-r md:border-trs-line' : ''}`}>
            <div className={`flex h-8 items-center justify-center gap-2 rounded-[8px] text-[13px] font-semibold ${SIDE_TONE[s]}`}>
              {SIDE_LABEL[s]} <span className="font-mono text-[12px] font-medium">{ds.length}</span>
            </div>
            {ds.map(draftCard)}
            {ds.length === 0 && emptyBoxes && (
              <div className="flex min-h-[56px] items-center justify-center rounded-[10px] border border-dashed border-trs-line-2 px-3 text-center text-[13px] text-trs-muted">
                {read ? 'No draft. Tick a suggestion above to draft one.' : 'No draft. Read to get suggestions.'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const proposed = (read?.steps ?? []).filter(s => s.status === 'proposed')
  const emails = proposed.filter(s => ticked.has(s.id) && s.kind === 'email').length
  const left = row.drafts.length

  return (
    <section className="rounded-[12px] border border-trs-line-2 bg-white overflow-hidden">
      <header className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 pl-2 pr-3 bg-trs-tint ${open ? 'border-b border-trs-line' : ''}`}>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Fold' : 'Open'} ${row.companyName}`} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border-0 bg-transparent text-trs-ink cursor-pointer hover:bg-trs-field">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {row.companyId
          ? <Link href={`/companies/${row.companyId}`} className="text-[15px] font-semibold text-trs-ink no-underline hover:underline">{row.companyName}</Link>
          : <span className="text-[15px] font-semibold text-trs-ink">{row.companyName}</span>}
        <span className="text-[12.5px] text-trs-muted">{row.threads.length} thread{row.threads.length === 1 ? '' : 's'}{row.lastAt ? ` · last ${timeAgo(row.lastAt)}` : ''}</span>
        {row.premium && row.premium.length > 0 && <span className="text-[12.5px] text-trs-ink" title="Current annual premium: latest new-business or renewal debit note per live policy, else the policy premium">Premium <span className="font-mono">{row.premium.map(p => money(p.amount, { ccy: p.currency, dp: 0 })).join(' + ')}</span></span>}
        {showOwner && <span className="text-[12.5px] text-trs-muted">Owner {first(row.owner)}</span>}
        <span className="flex-1" />
        <Chip tone={left ? 'neutral' : 'green'}>{left ? `${left} to send` : 'Cleared'}</Chip>
        {!hasProjects && <Btn size="xs" level="tertiary" onClick={() => { setThreadsOpen(v => !v); if (!open) onToggle() }} aria-expanded={threadsOpen}><MessageSquare size={14} /> Threads</Btn>}
        <Btn size="xs" onClick={doRead} loading={busy === 'read'} disabled={!!busy}><Sparkles size={14} /> {read ? 'Read again' : 'Read'}</Btn>
        {mine && <Btn size="xs" level="tertiary" onClick={remove} disabled={!!busy}>Remove</Btn>}
      </header>

      {error && <p className="m-0 px-4 pt-2.5 text-[13px] text-trs-neg" role="alert">{error}</p>}

      {!open && (
        <button type="button" onClick={onToggle} className="grid w-full grid-cols-1 md:grid-cols-2 border-0 bg-white p-0 text-left cursor-pointer">
          {(['client', 'insurer'] as const).map(s => (
            <span key={s} className={`flex min-w-0 flex-col gap-1 py-2.5 pl-[50px] pr-4 ${s === 'client' ? 'md:border-r md:border-trs-line' : ''}`}>
              <span className={`self-start rounded-full px-2 py-[1px] text-[11.5px] font-medium ${SIDE_TONE[s]}`}>{SIDE_LABEL[s]}</span>
              {foldSummary({ ...row, read }, s).map((l, i) => <Line key={i} l={l} />)}
            </span>
          ))}
        </button>
      )}

      {open && (
        <>
          {read && (
            <div className="px-4 py-3 border-b border-trs-line flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-trs-green"><Sparkles size={13} /> Summary</span>
                <span className="text-[12px] text-trs-muted">Read {timeAgo(read.at)} by {first(read.by)}</span>
              </div>
              <p className="m-0 text-[14px] font-medium text-trs-ink">{read.summary}</p>
              {read.situation && <ul className="m-0 pl-5 list-disc flex flex-col gap-0.5 text-[13px] leading-[1.5] text-trs-ink-2">{read.situation.split('\n').filter(Boolean).map((p, i) => <li key={i}>{p}</li>)}</ul>}
              {read.steps.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-[12.5px] font-semibold text-trs-ink">Suggested</span>
                  <ul className="m-0 p-0 list-none flex flex-col gap-1">
                    {read.steps.map(s => (
                      <li key={s.id} className="flex items-start gap-2 text-[13px]">
                        {s.status !== 'proposed'
                          ? <span className="mt-[2px] w-[13px] text-trs-pos" aria-hidden>✓</span>
                          : s.op && s.draftId
                            ? <span className="mt-[2px] w-[13px]" aria-hidden />
                            : <input type="checkbox" aria-label={s.title} checked={ticked.has(s.id)} onChange={() => setTicked(t => { const n = new Set(t); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} className="mt-[3px]" />}
                        <span className="min-w-0 flex-1">
                          <span className={`mr-1.5 rounded-full px-1.5 py-[1px] text-[11px] font-medium ${s.party === 'insurer' ? SIDE_TONE.insurer : s.party === 'client' ? SIDE_TONE.client : 'bg-trs-field text-trs-ink-2'}`}>{s.kind === 'action' ? 'Action' : s.party === 'insurer' ? (s.insurer ?? 'Insurer') : 'Client'}</span>
                          <span className="font-medium text-trs-ink">{s.title}</span>
                          {s.to && <span className="text-trs-muted"> · {s.to.name ?? s.to.email}</span>}
                          {s.source && <span className={`ml-1.5 rounded-full px-1.5 py-[1px] text-[11px] font-medium ${s.source === 'thread' ? 'bg-trs-pos-bg text-trs-pos' : 'bg-trs-warn-bg text-trs-warn'}`} title={s.source === 'thread' ? 'This person is already on the client’s threads.' : 'Picked from the Insurers page: not yet on the client’s threads.'}>{s.source === 'thread' ? 'On the thread' : 'From Insurers list'}</span>}
                          {s.status === 'drafted' && <span className="text-trs-pos"> · drafted</span>}
                          {s.status === 'todo' && <span className="text-trs-muted"> · to do</span>}
                          {s.status === 'done' && <span className="text-trs-pos"> · done</span>}
                          <span className="block text-[12.5px] text-trs-muted">{s.detail}</span>
                          {(() => { const th = threadForStep(s, row); return th ? <Link href={threadHref(th)} target="_blank" className="inline-flex items-center gap-1 text-[12px] text-trs-green-2 underline-offset-[3px] hover:underline"><ExternalLink size={11} aria-hidden /> Open thread</Link> : null })()}
                        </span>
                        {s.status === 'proposed' && s.op && s.draftId && (
                          <span className="flex flex-none gap-1.5">
                            <Btn size="xs" level={s.op === 'discard' ? 'danger' : 'secondary'} onClick={() => doStep(s.id, s.op!)} loading={busy === `step:${s.id}`} disabled={!!busy}>{s.op === 'discard' ? 'Discard email' : 'Update email'}</Btn>
                            <Btn size="xs" level="tertiary" onClick={() => doStep(s.id, 'done')} disabled={!!busy}>Skip</Btn>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {proposed.length > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <Btn size="xs" onClick={doDraft} loading={busy === 'draft'} disabled={!!busy || ticked.size === 0}>
                        {busy === 'draft' ? 'Drafting…' : emails ? `Draft ${emails} email${emails === 1 ? '' : 's'}` : ticked.size ? 'Mark to do' : 'Tick to draft'}
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!hasProjects ? (
            <>
              {threadsOpen && <div className="px-4 py-2.5 border-b border-trs-line">{threadList(row.threads)}</div>}
              {sideGrid(groups[0] ?? { project: null, note: null, threads: [], drafts: [] }, true)}
            </>
          ) : groups.map(g => (
            <section key={g.project ?? '(client)'} aria-label={g.project ?? row.companyName} className="border-b border-trs-line last:border-b-0">
              {g.project && (
                <header className="flex flex-wrap items-baseline gap-x-2 px-4 pt-3">
                  <span className="text-[14px] font-semibold text-trs-ink">{g.project}</span>
                  {g.note && <span className="text-[12.5px] text-trs-muted">{g.note}</span>}
                  <span className="text-[12px] text-trs-subtle">{g.threads.length} thread{g.threads.length === 1 ? '' : 's'}</span>
                </header>
              )}
              {g.threads.length > 0 && <div className="px-4 pt-2.5">{threadList(g.threads)}</div>}
              {g.drafts.length > 0 && sideGrid(g, false)}
              {g.drafts.length === 0 && <div className="h-3" />}
            </section>
          ))}
        </>
      )}
    </section>
  )
}

function Line({ l }: { l: FoldLine }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="h-[7px] w-[7px] flex-none rounded-full bg-trs-line-2" aria-hidden />
      <span className="font-medium text-trs-ink whitespace-nowrap">{l.party}</span>
      {l.project && <span className="whitespace-nowrap text-trs-ink-2">{l.project}</span>}
      <span className="truncate text-trs-muted">{l.todo}</span>
      {l.more > 0 && <span className="flex-none text-[12px] text-trs-muted">+{l.more}</span>}
    </span>
  )
}

/** One thread on the row: side, subject (opens it), counts; for the owner, Project and Remove. */
function ThreadLine({ t, mine, projectsOn, projects, busy, onRemove, onProject }: {
  t: DeskThread; mine: boolean; projectsOn: boolean; projects: string[]; busy: string | null
  onRemove: () => Promise<void>; onProject: (project: string, note: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [project, setProject] = useState(t.project ?? '')
  const [note, setNote] = useState(t.projectNote ?? '')
  const listId = `projects-${t.threadId}`
  return (
    <li className="flex flex-col gap-1.5 text-[13px]">
      <span className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-[1px] text-[11.5px] font-medium ${SIDE_TONE[t.side]}`}>{t.side === 'client' ? 'Client' : 'Insurer'}</span>
        <Link href={threadHref(t.threadId)} className="font-medium text-trs-ink">{t.subject}</Link>
        <span className="text-trs-muted">{t.messages} email{t.messages === 1 ? '' : 's'}{t.lastAt ? ` · ${fmtDay(t.lastAt)}` : ''}{t.lastInbound ? ' · waiting on TRS' : ''}</span>
        {mine && (
          <span className="ml-auto inline-flex items-center gap-1">
            {projectsOn && !editing && <Btn size="xs" level="tertiary" onClick={() => setEditing(true)} disabled={!!busy}>{t.project ? 'Project' : 'Set project'}</Btn>}
            <InlineConfirm label="Remove" question="Remove this thread from Today?" action="Remove" onConfirm={onRemove} busy={busy === `thread:${t.threadId}`} disabled={!!busy && busy !== `thread:${t.threadId}`} />
          </span>
        )}
      </span>
      {editing && (
        <span className="flex flex-wrap items-center gap-2 pl-1">
          <input aria-label="Project" list={listId} placeholder="Project, e.g. Main project" value={project} onChange={e => setProject(e.target.value)} className={`${inputCls} !h-8 w-[220px] text-[13px]`} />
          <datalist id={listId}>{projects.map(p => <option key={p} value={p} />)}</datalist>
          <input aria-label="Project description" placeholder="Description" value={note} onChange={e => setNote(e.target.value)} maxLength={160} className={`${inputCls} !h-8 w-[260px] text-[13px]`} />
          <Btn size="xs" onClick={async () => { if (await onProject(project, note)) setEditing(false) }} loading={busy === `project:${t.threadId}`} disabled={!!busy}>Save</Btn>
          <Btn size="xs" level="tertiary" onClick={() => { setEditing(false); setProject(t.project ?? ''); setNote(t.projectNote ?? '') }} disabled={!!busy}>Cancel</Btn>
        </span>
      )}
    </li>
  )
}
