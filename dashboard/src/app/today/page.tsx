'use client'

/**
 * Today: the morning list. Every open case that needs a person, in four groups: Ready to send,
 * Decide, To act, Read. "Come back later" holds a case until a time or until the other side
 * replies. j/k move, Enter opens. Nothing sends from here; Review and send opens the case.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Btn, Chip, Segmented, Spinner, Empty, LinkBtn } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { CASE_TYPE, STATUS, LaterMenu, fmtDate } from '@/components/assistant/shared'
import { ComingUp } from '@/components/today/ComingUp'
import { STAGE_LABEL, isStage } from '@/lib/cases/stage'
import { LATER_LABEL, type LaterChoice } from '@/lib/today/rules'
import { homeBridgeOf, BRIDGE_LABEL as HOME_BRIDGE_LABEL, LEVEL_LABEL, type PendingLevel, type Side } from '@/lib/today/pending'
import type { TodayItem } from '@/lib/today/data'

type Who = 'mine' | 'all'
type View = 'list' | 'coming'
type Group = 'send' | 'decide' | 'act' | 'read' | 'later'
const GROUPS: { key: Group; label: string }[] = [
  { key: 'send', label: 'Ready to send' }, { key: 'decide', label: 'Decide' },
  { key: 'act', label: 'To act' }, { key: 'read', label: 'Read' }, { key: 'later', label: 'Come back later' },
]
const BRIDGE_LABEL: Record<string, string> = HOME_BRIDGE_LABEL
const SIDE_LABEL: Record<string, string> = { client: 'waiting on client', insurer: 'waiting on insurer', trs: 'for TRS' }

export default function TodayRoute() {
  return <Suspense fallback={null}><TodayPage /></Suspense>
}

function TodayPage() {
  const router = useRouter()
  const params = useSearchParams()
  const bridge = params.get('bridge')
  const level = params.get('level') as PendingLevel | null
  const side = params.get('side') as Side | null
  const [items, setItems] = useState<TodayItem[] | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [who, setWho] = useState<Who>('mine')
  const [view, setView] = useState<View>(params.get('view') === 'coming' ? 'coming' : 'list')
  const [showLater, setShowLater] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    callApi<{ items: TodayItem[]; me: string | null }>('/api/today')
      .then(d => { setItems(d.items); setMe(d.me); if (d.me && !d.items.some(i => i.owner_email === d.me)) setWho('all') })
      .catch(e => setError(errText(e)))
  }, [])
  useEffect(() => { load() }, [load])

  const scoped = useMemo(() => (items ?? [])
    .filter(i => who === 'all' || i.owner_email === me || !i.owner_email)
    .filter(i => !bridge || homeBridgeOf(i.case_type) === bridge)
    .filter(i => !level || i.pending.level === level)
    .filter(i => !side || i.side === side), [items, who, me, bridge, level, side])
  const count = (g: Group) => scoped.filter(i => i.group === g).length
  // The rows j/k walk: every visible group, Later only when it is open.
  const flat = useMemo(() => GROUPS.filter(g => g.key !== 'later' || showLater).flatMap(g => scoped.filter(i => i.group === g.key)), [scoped, showLater])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input,textarea,select,[contenteditable="true"],[role="menu"]')) return
      if (e.key === 'j') setCursor(c => Math.min(c + 1, Math.max(flat.length - 1, 0)))
      else if (e.key === 'k') setCursor(c => Math.max(c - 1, 0))
      else if (e.key === 'Enter' && flat[cursor]) router.push(`/today/${flat[cursor].id}`)
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [flat, cursor, router])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  const done = (msg: string) => { setNotice(msg); setError(null); load() }
  const active = scoped.filter(i => i.group !== 'later').length

  return (
    <div className="px-4 md:px-8 py-6 max-w-[980px] mx-auto w-full min-w-0">
      <PageHeader className="mb-5" title="Today"
        meta={items ? `${active} to go through · ${count('send')} ready to send · ${count('decide')} decisions · ${count('act')} to act · ${count('read')} to read` : undefined}
        actions={view === 'list' && flat[0] && <LinkBtn level="primary" href={`/today/${flat[0].id}`}>Start</LinkBtn>}>
        <Segmented<View> value={view} onChange={setView} label="View" options={[
          { value: 'list', label: 'To do', count: items ? active : undefined },
          { value: 'coming', label: 'Coming up' },
        ]} />
        {view === 'list' && <Segmented<Who> value={who} onChange={setWho} label="Owner" options={[
          { value: 'mine', label: 'Mine', count: (items ?? []).filter(i => i.group !== 'later' && (i.owner_email === me || !i.owner_email)).length },
          { value: 'all', label: 'Everyone', count: (items ?? []).filter(i => i.group !== 'later').length },
        ]} />}
        {view === 'list' && (bridge || level || side) && <span className="inline-flex items-center gap-2 text-[13px] text-trs-muted">{[bridge && (BRIDGE_LABEL[bridge] ?? bridge), level && LEVEL_LABEL[level], side && SIDE_LABEL[side]].filter(Boolean).join(' · ')}<Link href="/today" className="text-trs-ink">Show all</Link></span>}
      </PageHeader>

      {error && <p className="m-0 mb-3 text-[13.5px] text-trs-neg">{error}</p>}
      {notice && <p className="m-0 mb-3 text-[13.5px] text-trs-ink" role="status">{notice}</p>}

      {view === 'coming' ? <ComingUp /> : !items ? <Spinner label="Loading today’s list…" /> : active === 0 && count('later') === 0 ? <Empty>Nothing waiting on you.</Empty> : (
        <div ref={listRef} className="rounded-[10px] border border-trs-line bg-white overflow-hidden">
          {GROUPS.map(g => {
            const rows = scoped.filter(i => i.group === g.key)
            if (!rows.length) return null
            const collapsed = g.key === 'later' && !showLater
            return (
              <section key={g.key} aria-label={g.label}>
                <div className="flex items-center justify-between px-4 h-9 bg-trs-canvas border-b border-trs-line">
                  <h2 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-trs-muted">{g.label}</h2>
                  {g.key === 'later'
                    ? <button type="button" onClick={() => setShowLater(v => !v)} className="bg-transparent border-0 cursor-pointer text-[12.5px] text-trs-muted hover:text-trs-ink">{collapsed ? `Show ${rows.length}` : 'Hide'}</button>
                    : <span className="font-mono text-[11.5px] text-trs-muted">{rows.length}</span>}
                </div>
                {!collapsed && rows.map(i => {
                  const n = flat.indexOf(i)
                  return <Row key={i.id} item={i} on={n === cursor} index={n} onFocus={() => setCursor(n)} onDone={done} onError={setError} />
                })}
              </section>
            )
          })}
        </div>
      )}
      {view === 'list' && <p className="m-0 mt-3 text-[12px] text-trs-muted hidden md:block">j and k move · Enter opens</p>}
    </div>
  )
}

function Row({ item: i, on, index, onFocus, onDone, onError }: { item: TodayItem; on: boolean; index: number; onFocus: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const st = STATUS[i.status] ?? STATUS.trs_to_act
  const forward = i.draft?.kind === 'forward_to_insurer'
  const n = (i.draft ? 1 : 0) + i.paired.length

  async function seen() {
    setBusy(true)
    try { await callApi(`/api/today/${i.id}`, { method: 'POST', body: { action: 'seen' } }); onDone(`Read: ${i.title}.`) }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  async function back() {
    setBusy(true)
    try { await callApi(`/api/work/${i.id}/later`, { method: 'POST', body: { choice: null } }); onDone(`Back on the list: ${i.title}.`) }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <div data-row={index} onMouseEnter={onFocus}
      className={`grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 border-b border-trs-line last:border-b-0 ${on ? 'bg-trs-canvas shadow-[inset_3px_0_0_var(--trs-green)]' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {(i.pending.level === 'red' || i.pending.level === 'amber') && <span title={i.pending.reason} className={`inline-block w-2 h-2 rounded-full ${i.pending.level === 'red' ? 'bg-trs-neg' : 'bg-trs-warn'}`} />}
          <Chip>{CASE_TYPE[i.case_type] ?? i.case_type}</Chip>
          {isStage(i.stage) && <Chip tone="blue">{STAGE_LABEL[i.stage]}</Chip>}
          <span className="text-[12.5px] text-trs-muted truncate">{i.client}{i.insurer_name ? ` · ${i.insurer_name}` : ''}</span>
          {i.group === 'act' && <Chip tone={st.tone}>{st.label}</Chip>}
          {i.group === 'later' && <Chip>{i.later_when ? LATER_LABEL[i.later_when as LaterChoice] : `Back ${fmtDate(i.later_until)}`}</Chip>}
        </div>
        <Link href={`/today/${i.id}`} className="block mt-1 text-[15px] font-medium leading-snug text-trs-ink no-underline hover:underline">{i.title}</Link>
        {i.needs_human && <p className="m-0 mt-1.5 text-[13.5px] text-trs-ink-2"><span className="text-trs-neg">Decide: </span>{i.needs_human}</p>}
        {i.draft && !i.needs_human && (
          <div className="mt-1.5 rounded-[8px] border border-trs-line bg-trs-canvas px-3 py-2 text-[13px] text-trs-ink-2">
            <div className="text-[12px] text-trs-muted truncate">To {i.draft.to}{n > 1 ? ` · + ${n - 1} paired` : ''}</div>
            <div className="line-clamp-2 whitespace-pre-line">{i.draft.body.replace(/\{owner_name\}/g, '').split('\n').filter(Boolean).slice(0, 3).join(' ')}</div>
          </div>
        )}
        {!i.draft && !i.needs_human && i.next_action && <p className="m-0 mt-1.5 text-[13.5px] text-trs-ink-2">{i.next_action}</p>}
      </div>
      <div className="flex flex-wrap items-start justify-start md:justify-end gap-1.5">
        {i.group === 'later' ? <Btn size="xs" loading={busy} onClick={() => void back()}>Bring back</Btn> : <>
          {i.group === 'read'
            ? <Btn size="xs" loading={busy} onClick={() => void seen()}>Mark read</Btn>
            : <LinkBtn size="xs" href={`/today/${i.id}`}>{i.group === 'decide' ? 'Decide' : i.draft ? (forward ? 'Review and forward' : 'Review and send') : 'Open'}</LinkBtn>}
          <LaterMenu itemId={i.id} onSet={l => onDone(`${l}: ${i.title}.`)} onError={onError} />
        </>}
      </div>
    </div>
  )
}
