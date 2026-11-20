'use client'

/**
 * One client on Today. Folded: per side, who the email is to, the project and the to-do (blank when
 * nothing waits). Open: the Read (summary, points, suggested emails to tick and draft), then the
 * threads and emails by project: threads without a project sit under the client, each project
 * below with its threads and its To client and To insurer emails. Read, Draft and Discard and redo
 * are the only model calls, each on its button.
 */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, MessageSquare, Sparkles } from 'lucide-react'
import { Btn, Chip } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { callApi, errText } from '@/components/placement/shared'
import { useConfirm } from '@/components/ui/confirm'
import { fmtDay, timeAgo } from '@/lib/format'
import type { ReadPlan } from '@/lib/chief/read'
import { foldSummary, groupProjects, projectNames, threadForStep, type DeskDraft, type DeskRow, type DeskSide, type DeskThread, type FoldLine, type ProjectGroup } from '@/lib/today/desk'
import type { Condensed } from '@/lib/today/condense'
import { markOlderDrafts } from '@/lib/today/old-drafts'
import { waitingOnRow, type RowFacts } from '@/lib/today/substance'
import type { RowDetail } from '@/lib/today/substance-server'
import { DraftCard } from './DraftCard'
import { OpenThread, ThreadTitle } from './PrivateThread'
import { CondensedFacts, FactsLine, PartiesLine, RowDetailBlocks, SuggestedProjects } from './RowSubstance'
import { InlineConfirm } from './InlineConfirm'

const SIDE_LABEL: Record<DeskSide, string> = { client: 'To client', insurer: 'To insurer' }
const first = (s: string) => s.split(/[\s@]/)[0]

export function ClientRow({ row, open, onToggle, showOwner, me, onChange, onNotice, projectsOn = false, facts }: {
  row: DeskRow; open: boolean; onToggle: () => void; showOwner: boolean; me: string
  /** Renewal, current insurer and premium, stage: read after the rows (/api/today/desk/facts). */
  facts?: RowFacts | null
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
  const ages = useMemo(() => markOlderDrafts(row.drafts), [row.drafts])
  const privateOf = useCallback((id: string) => row.threads.find(t => t.threadId === id)?.private ?? null, [row.threads])

  // The row's detail is read when it is opened, never on the page's first load.
  const [detail, setDetail] = useState<RowDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const threadKey = ids.join(',') + '|' + row.threads.map(t => t.project ?? '').join(',')
  const loadDetail = useCallback(() => {
    setDetailLoading(true); setDetailError(null)
    callApi<RowDetail>('/api/today/desk/detail', { method: 'POST', body: { owner: row.owner, companyId: row.companyId, threadIds: threadKey.split('|')[0].split(',') } })
      .then(setDetail).catch(e => setDetailError(errText(e))).finally(() => setDetailLoading(false))
  }, [row.owner, row.companyId, threadKey])
  useEffect(() => { if (open) loadDetail() }, [open, loadDetail])
  const condensedOf = (project: string | null) => detail?.projects.find(p => (p.project ?? '').toLowerCase() === (project ?? '').toLowerCase())
  async function condense(project: string | null, threadIds: string[]) {
    setBusy(`condense:${project ?? ''}`); setError(null)
    try {
      const r = await callApi<{ condensed: Condensed }>('/api/today/desk', { method: 'POST', body: { action: 'condense', ...base, project, projectThreadIds: threadIds } })
      setDetail(d => d && ({ ...d, projects: d.projects.map(p => ((p.project ?? '').toLowerCase() === (project ?? '').toLowerCase() ? { ...p, condensed: { ...r.condensed, stale: false } } : p)) }))
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }
  async function confirmProject(name: string, threadIds: string[]) {
    setBusy(`suggest:${name}`); setError(null)
    try {
      await callApi('/api/today/desk', { method: 'POST', body: { action: 'project', owner: row.owner, companyId: row.companyId, threadIds, project: name, note: '' } })
      onNotice(`${threadIds.length} thread${threadIds.length === 1 ? '' : 's'} moved to ${name}.`); onChange()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  async function doRead() {
    setBusy('read'); setError(null)
    try {
      const r = await callApi<{ read: ReadPlan }>('/api/today/desk', { method: 'POST', body: { action: 'read', ...base } })
      setRead(r.read)
      setTicked(new Set(r.read.steps.filter(s => s.kind === 'email' && s.status === 'proposed').map(s => s.id)))
      // The Read's facts are kept as the client's state: shown in State, not as sentences.
      if (!open) onToggle(); else loadDetail()
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
      age={ages.get(d.id)} readOnly={!mine} onNotice={onNotice}
      onSent={to => { onNotice(`Sent to ${to}.`); onChange() }}
      onDiscarded={() => { onNotice('Email discarded.'); onChange() }}
      onSaved={saved} onRedone={saved} />
  )
  const threadList = (ts: DeskThread[]) => (
    <ul className="m-0 list-none p-0 flex flex-col gap-1.5">
      {ts.map(t => (
        <ThreadLine key={t.threadId} t={t} mine={mine} onNotice={onNotice} projectsOn={projectsOn} projects={projects} busy={busy}
          onRemove={() => removeThread(t)} onProject={(p, n) => saveProject(t, p, n)} />
      ))}
    </ul>
  )
  const sideGrid = (g: ProjectGroup, emptyBoxes: boolean) => (
    <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
      {(['client', 'insurer'] as const).map(s => {
        const ds = g.drafts.filter(d => d.side === s)
        return (
          <div key={s} className="flex min-w-0 flex-col gap-3 py-3">
            <span className="self-start"><Chip>{SIDE_LABEL[s]} <span className="font-mono">{ds.length}</span></Chip></span>
            {ds.map(draftCard)}
            {ds.length === 0 && emptyBoxes && (
              <div className="text-body text-trs-muted">
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
    <section className="bg-white scroll-mt-20" data-company={row.companyId ?? undefined}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5">
        <Btn size="xs" level="tertiary" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Fold' : 'Open'} ${row.companyName}`} className="w-8 px-0 border-0 text-trs-ink hover:bg-trs-field">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </Btn>
        {row.companyId
          ? <Link href={`/companies/${row.companyId}`} className="text-body font-semibold text-trs-ink no-underline hover:underline">{row.companyName}</Link>
          : <span className="text-body font-semibold text-trs-ink">{row.companyName}</span>}
        <span className="text-small text-trs-muted">{row.threads.length} thread{row.threads.length === 1 ? '' : 's'}{row.lastAt ? ` · last ${timeAgo(row.lastAt)}` : ''}</span>
        {showOwner && <span className="text-small text-trs-muted">Owner {first(row.owner)}</span>}
        <span className="flex-1" />
        <Chip tone={left ? 'neutral' : 'green'}>{left ? `${left} to send` : 'Cleared'}</Chip>
        {!hasProjects && <Btn size="xs" level="tertiary" onClick={() => { setThreadsOpen(v => !v); if (!open) onToggle() }} aria-expanded={threadsOpen}><MessageSquare size={14} /> Threads</Btn>}
        <Btn size="xs" onClick={doRead} loading={busy === 'read'} disabled={!!busy}><Sparkles size={14} /> {read ? 'Read again' : 'Read'}</Btn>
        {mine && <Btn size="xs" level="tertiary" onClick={remove} disabled={!!busy}>Remove</Btn>}
        <FactsLine facts={facts} waiting={waitingOnRow(row.threads)} />
      </header>

      {error && <p className="m-0 md:pl-[42px] pt-1.5 text-body text-trs-neg" role="alert">{error}</p>}

      {!open && (
        <Btn level="tertiary" onClick={onToggle} className="grid h-auto w-full grid-cols-1 items-stretch justify-stretch gap-x-8 gap-y-0 md:grid-cols-2 border-0 bg-white p-0 text-left font-normal whitespace-normal text-trs-ink hover:bg-white hover:text-trs-ink">
          {(['client', 'insurer'] as const).map(s => (
            <span key={s} className="flex min-w-0 flex-col gap-1 py-1.5 md:pl-[42px] pr-4">
              <span className="self-start"><Chip>{SIDE_LABEL[s]}</Chip></span>
              {foldSummary({ ...row, read }, s).map((l, i) => <Line key={i} l={l} />)}
            </span>
          ))}
        </Btn>
      )}

      {open && (
        <>
          {read && (
            <div className="md:pl-[42px] py-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="inline-flex items-center gap-1.5 text-small font-semibold text-trs-green"><Sparkles size={13} /> Read</span>
                <span className="text-small text-trs-muted">{timeAgo(read.at)} by {first(read.by)}</span>
              </div>
              {read.steps.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-small font-semibold text-trs-ink">Suggested</span>
                  <ul className="m-0 p-0 list-none flex flex-col gap-1">
                    {read.steps.map(s => (
                      <li key={s.id} className="flex items-start gap-2 text-body">
                        {s.status !== 'proposed'
                          ? <span className="mt-[2px] w-[13px] text-trs-pos" aria-hidden>✓</span>
                          : s.op && s.draftId
                            ? <span className="mt-[2px] w-[13px]" aria-hidden />
                            : <input type="checkbox" aria-label={s.title} checked={ticked.has(s.id)} onChange={() => setTicked(t => { const n = new Set(t); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} className="mt-[3px] accent-trs-green" />}
                        <span className="min-w-0 flex-1">
                          <Chip className="mr-1.5">{s.kind === 'action' ? 'Action' : s.party === 'insurer' ? (s.insurer ?? 'Insurer') : 'Client'}</Chip>
                          <span className="font-medium text-trs-ink">{s.title}</span>
                          {s.to && <span className="text-trs-muted"> · {s.to.name ?? s.to.email}</span>}
                          {s.source && <span className={`ml-1.5 rounded-full px-1.5 py-[1px] text-small font-medium ${s.source === 'thread' ? 'bg-trs-pos-bg text-trs-pos' : 'bg-trs-warn-bg text-trs-warn'}`} title={s.source === 'thread' ? 'This person is already on the client’s threads.' : 'Picked from the Insurers page: not yet on the client’s threads.'}>{s.source === 'thread' ? 'On the thread' : 'From Insurers list'}</span>}
                          {s.status === 'drafted' && <span className="text-trs-pos"> · drafted</span>}
                          {s.status === 'todo' && <span className="text-trs-muted"> · to do</span>}
                          {s.status === 'done' && <span className="text-trs-pos"> · done</span>}
                          <span className="block text-small text-trs-muted">{s.detail}</span>
                          {(() => { const th = threadForStep(s, row); return th ? <OpenThread threadId={th} owner={privateOf(th)} onNotice={onNotice} /> : null })()}
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

          <div className="md:pl-[42px] py-3 flex flex-col gap-4">
            <CondensedFacts title={row.companyName} c={condensedOf(null)?.condensed ?? null} canRun={mine} busy={busy === 'condense:'} onCondense={() => condense(null, ids)} />
            {detail && <SuggestedProjects suggestions={detail.suggestions} mine={mine && projectsOn} busy={busy} onConfirm={confirmProject} />}
            {!hasProjects && detail?.projects[0] && <PartiesLine parties={detail.projects[0].parties} />}
            <RowDetailBlocks detail={detail} loading={detailLoading} error={detailError} onRetry={loadDetail} onNotice={onNotice} privateOf={privateOf} />
          </div>

          {!hasProjects ? (
            <>
              {threadsOpen && <div className="md:pl-[42px] py-2.5">{threadList(row.threads)}</div>}
              <div className="md:pl-[42px]">{sideGrid(groups[0] ?? { project: null, note: null, threads: [], drafts: [] }, true)}</div>
            </>
          ) : groups.map(g => (
            <section key={g.project ?? '(client)'} aria-label={g.project ?? row.companyName} className="md:pl-[42px] pt-4">
              {g.project && (
                <header className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-body font-semibold text-trs-ink">{g.project}</span>
                  {g.note && <span className="text-small text-trs-muted">{g.note}</span>}
                  <span className="text-small text-trs-subtle">{g.threads.length} thread{g.threads.length === 1 ? '' : 's'}</span>
                </header>
              )}
              {g.project && condensedOf(g.project) && (
                <div className="flex flex-col gap-2 pt-2">
                  <PartiesLine parties={condensedOf(g.project)!.parties} />
                  <CondensedFacts title={g.project} c={condensedOf(g.project)!.condensed} canRun={mine} busy={busy === `condense:${g.project}`} onCondense={() => condense(g.project, g.threads.map(t => t.threadId))} />
                </div>
              )}
              {g.threads.length > 0 && <div className="pt-2.5">{threadList(g.threads)}</div>}
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
    <span className="flex min-w-0 items-center gap-2 text-body">
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-trs-line-2" aria-hidden />
      <span className="font-medium text-trs-ink whitespace-nowrap">{l.party}</span>
      {l.project && <span className="whitespace-nowrap text-trs-ink-2">{l.project}</span>}
      <span className="truncate text-trs-muted">{l.todo}</span>
      {l.more > 0 && <span className="flex-none text-small text-trs-muted">+{l.more}</span>}
    </span>
  )
}

/** One thread on the row: side, subject (opens it), counts; for the owner, Project and Remove. */
function ThreadLine({ t, mine, projectsOn, projects, busy, onRemove, onProject, onNotice }: {
  t: DeskThread; mine: boolean; projectsOn: boolean; projects: string[]; busy: string | null; onNotice: (m: string) => void
  onRemove: () => Promise<void>; onProject: (project: string, note: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [project, setProject] = useState(t.project ?? '')
  const [note, setNote] = useState(t.projectNote ?? '')
  const listId = `projects-${t.threadId}`
  return (
    <li className="flex flex-col gap-1.5 text-body">
      <span className="flex flex-wrap items-center gap-2">
        <Chip>{t.side === 'client' ? 'Client' : 'Insurer'}</Chip>
        <ThreadTitle threadId={t.threadId} subject={t.subject} owner={t.private} onNotice={onNotice} />
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
          <Input aria-label="Project" list={listId} placeholder="Project, e.g. Main project" value={project} onChange={e => setProject(e.target.value)} className="h-8 w-[220px]" />
          <datalist id={listId}>{projects.map(p => <option key={p} value={p} />)}</datalist>
          <Input aria-label="Project description" placeholder="Description" value={note} onChange={e => setNote(e.target.value)} maxLength={160} className="h-8 w-[260px]" />
          <Btn size="xs" onClick={async () => { if (await onProject(project, note)) setEditing(false) }} loading={busy === `project:${t.threadId}`} disabled={!!busy}>Save</Btn>
          <Btn size="xs" level="tertiary" onClick={() => { setEditing(false); setProject(t.project ?? ''); setNote(t.projectNote ?? '') }} disabled={!!busy}>Cancel</Btn>
        </span>
      )}
    </li>
  )
}
