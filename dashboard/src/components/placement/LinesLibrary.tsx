'use client'

/**
 * Quotes › Lines (Phase 5 of the Workbench revamp, 19 Nov 2026): per line, Data required from client
 * beside From insurer, the two drafts, and Knowledge for AI. Every block has Edit, Confirm and
 * Versions; a save or a restore is a new version (src/app/api/placements/line-texts).
 */
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Btn, Spinner, inputCls } from '@/components/crm/primitives'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { fmtDateTime } from '@/lib/format'
import { LINES, rowsFrom, type Part, type Row } from '@/lib/placement/line-library'

type Current = { body: string; edited_by: string | null; created_at: string | null }
type Version = { id: string; part: Part; body: string; edited_by: string; created_at: string }
type Data = { parts: Record<Part, Current>; versions: Record<Part, Version[]>; saving: boolean }
type Save = (part: Part, body: unknown) => Promise<string | null>

const Card = ({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex min-w-0 flex-col overflow-hidden rounded border border-trs-line-2 bg-white">
    <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-trs-line px-4 py-1.5 text-trs-ink"><h3 className="m-0 text-body font-semibold">{title}</h3><span className="flex items-center gap-2 text-small font-normal text-trs-muted">{meta}</span></header>
    {children}
  </section>
)

export function LinesLibrary() {
  const router = useRouter(), sp = useSearchParams()
  const key = LINES.some(l => l.key === sp.get('line')) ? sp.get('line')! : LINES[0].key
  const line = LINES.find(l => l.key === key)!
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/placements/line-texts?line=${key}`, { cache: 'no-store' }); const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error ?? 'Could not load this line'); else { setError(null); setData(j) }
  }, [key])
  useEffect(() => { setData(null); void load() }, [load])

  const save: Save = async (part, body) => {
    const r = await fetch('/api/placements/line-texts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line: key, part, body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return j.error ?? 'Could not save'
    await load()
    return null
  }

  return (
    <div className="mx-auto w-full px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0 max-w-[1440px]">
      <PageHeader title="Lines" meta={<span className="text-body text-trs-muted">{LINES.length} lines · starting text from the 19 Nov 2026 mail study</span>} />
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Lines" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {LINES.map(l => (
            <Btn key={l.key} level="tertiary" onClick={() => router.replace(`/lines?line=${l.key}`, { scroll: false })}
              aria-current={l.key === key ? 'page' : undefined}
              className={cn('shrink-0 h-auto justify-start border-0 px-3 py-2 text-left text-body font-normal', l.key === key ? 'bg-trs-ink text-white font-medium hover:bg-trs-ink hover:text-white' : 'bg-transparent text-trs-ink hover:bg-trs-tint')}>{l.short}</Btn>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h2 className="m-0 text-heading font-semibold text-trs-ink">{line.short}</h2>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-body"><span className="text-trs-muted">{line.label}</span><span><span className="text-trs-muted">Brochure price </span>{line.brochure}</span></div>
          </div>
          {error && <div className="text-body text-trs-neg">{error}</div>}
          {!data && !error && <Spinner label="Loading the line" />}
          {data && <>
            <div className="grid gap-5 xl:grid-cols-2">
              <TableBlock title="Data required from client" part="client_data" cols={['Item', 'Typical value', 'Seen']} data={data} save={save} />
              <TableBlock title="From insurer" part="insurer_asks" cols={['Question', 'Note', 'Seen']} data={data} save={save} />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <ListBlock title="Documents from client" rows={line.documents.map(([a, b]) => [a, b])} />
              <ListBlock title="Insurer declines" rows={line.declines.map(([a, n]) => [a, `${n} threads`])} />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <TextBlock title="Draft to insurer" part="to_insurer" data={data} save={save} />
              <TextBlock title="Draft to client" part="to_client" data={data} save={save} />
            </div>
            <TextBlock title="Knowledge for AI" part="knowledge" data={data} save={save} />
          </>}
        </div>
      </div>
    </div>
  )
}

function ListBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <Card title={`${title} · ${rows.length}`} meta="Mail study">
      {rows.length === 0 && <div className="px-4 py-6 text-center text-body text-trs-muted">None seen.</div>}
      <ul className="m-0 list-none p-0">{rows.map(([a, b], i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 border-b border-trs-line px-4 py-2.5 text-body last:border-b-0">
          <span className="text-trs-ink">{a}</span><span className="text-center text-trs-muted">{b}</span>
        </li>))}</ul>
    </Card>
  )
}

/** Who saved the current text and when, or the study when nothing is saved. */
function Saved({ cur, note }: { cur: Current; note: string | null }) {
  if (note) return <span className="text-trs-pos">{note}</span>
  return <span>{cur.created_at ? `${cur.edited_by} · ${fmtDateTime(cur.created_at)}` : 'Mail study'}</span>
}

function Versions({ part, data, save, render }: { part: Part; data: Data; save: Save; render: (body: string) => string }) {
  const confirm = useConfirm()
  const [err, setErr] = useState<string | null>(null)
  const list = data.versions[part]
  return (
    <div className="border-b border-trs-line bg-trs-tint">
      {list.length === 0 && <div className="px-4 py-3 text-body text-trs-muted">No saved versions. The text shown is the mail study.</div>}
      <ol className="m-0 list-none p-0">{list.map((v, i) => (
        <li key={v.id} className="flex items-center justify-between gap-3 border-b border-trs-line px-4 py-2 text-small last:border-b-0">
          <span className="min-w-0"><b className="font-medium text-trs-ink">Version {list.length - i}</b> <span className="text-trs-muted">· {v.edited_by} · {fmtDateTime(v.created_at)}{i === 0 ? ' · current' : ''}</span>
            <span className="block truncate text-trs-muted">{render(v.body)}</span></span>
          {i > 0 && <Btn size="xs" onClick={async () => {
            if (!await confirm({ title: `Restore version ${list.length - i}?`, body: 'It becomes the current text as a new version. Nothing is deleted.', action: 'Restore' })) return
            setErr(await save(part, part === 'client_data' || part === 'insurer_asks' ? rowsFrom(v.body) : v.body))
          }}>Restore</Btn>}
        </li>))}</ol>
      {err && <div className="px-4 py-2 text-small text-trs-neg">{err}</div>}
    </div>
  )
}

function TextBlock({ title, part, data, save }: { title: string; part: Part; data: Data; save: Save }) {
  const cur = data.parts[part]
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [note, setNote] = useState<string | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const n = data.versions[part].length
  return (
    <Card title={title} meta={<>
      <Saved cur={cur} note={note} />
      <Btn size="xs" onClick={() => setShowVersions(v => !v)}>Versions · {n}</Btn>
      {draft == null && <Btn size="xs" disabled={!data.saving} title={data.saving ? undefined : 'Saving starts once the texts table is added'} onClick={() => { setDraft(cur.body); setNote(null); setErr(null) }}>Edit</Btn>}
    </>}>
      {showVersions && <Versions part={part} data={data} save={save} render={b => b.slice(0, 140)} />}
      {draft == null
        ? <div className="whitespace-pre-wrap px-4 py-3 text-body leading-[1.6] text-trs-ink">{cur.body}</div>
        : <div className="flex flex-col gap-2 px-4 py-3">
          <textarea aria-label={title} value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(28, Math.max(8, draft.split('\n').length + 1))} className={`${inputCls} h-auto py-2 font-[inherit] text-body leading-[1.6]`} />
          <div className="flex items-center justify-end gap-2">
            {err && <span className="mr-auto text-small text-trs-neg">{err}</span>}
            <Btn onClick={() => setDraft(null)}>Cancel</Btn>
            <Btn level="primary" loading={busy} disabled={draft.trim() === cur.body.trim()} onClick={async () => {
              setBusy(true); const e = await save(part, draft); setBusy(false)
              if (e) setErr(e); else { setDraft(null); setNote(`Saved · version ${n + 1}`) }
            }}>Confirm</Btn>
          </div>
        </div>}
    </Card>
  )
}

function TableBlock({ title, part, cols, data, save }: { title: string; part: Part; cols: [string, string, string]; data: Data; save: Save }) {
  const confirm = useConfirm()
  const cur = data.parts[part]
  const rows = rowsFrom(cur.body)
  const [draft, setDraft] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [note, setNote] = useState<string | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const n = data.versions[part].length
  const set = (i: number, k: keyof Row, v: string) => setDraft(d => d && d.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const shown = draft ?? rows
  return (
    <Card title={`${title} · ${rows.length}`} meta={<>
      <Saved cur={cur} note={note} />
      <Btn size="xs" onClick={() => setShowVersions(v => !v)}>Versions · {n}</Btn>
      {draft == null && <Btn size="xs" disabled={!data.saving} title={data.saving ? undefined : 'Saving starts once the texts table is added'} onClick={() => { setDraft(rows); setNote(null); setErr(null) }}>Edit</Btn>}
    </>}>
      {showVersions && <Versions part={part} data={data} save={save} render={b => rowsFrom(b).map(r => r.item).join(' · ')} />}
      <Register label={title} minWidth={480}>
          <RegisterHead>
            <RegisterTh>{cols[0]}</RegisterTh><RegisterTh>{cols[1]}</RegisterTh><RegisterTh width={110}>{cols[2]}</RegisterTh>
            {draft && <RegisterTh width={84}>Remove</RegisterTh>}
          </RegisterHead>
          <tbody>
            {shown.length === 0 && <RegisterEmpty colSpan={draft ? 4 : 3}>No rows.</RegisterEmpty>}
            {shown.map((r, i) => draft ? (
              <RegisterRow key={i}>
                <RegisterCell align="left"><Input aria-label={`${cols[0]} ${i + 1}`} value={r.item} onChange={e => set(i, 'item', e.target.value)} className={inputCls} /></RegisterCell>
                <RegisterCell align="left"><Input aria-label={`${cols[1]} ${i + 1}`} value={r.detail} onChange={e => set(i, 'detail', e.target.value)} className={inputCls} /></RegisterCell>
                <RegisterCell><Input aria-label={`${cols[2]} ${i + 1}`} value={r.seen} onChange={e => set(i, 'seen', e.target.value)} className={`${inputCls} text-center`} /></RegisterCell>
                <RegisterCell><Btn size="xs" onClick={async () => {
                  if (!await confirm({ title: 'Remove this row?', body: r.item || 'Blank row', action: 'Remove', danger: true })) return
                  setDraft(d => d && d.filter((_, j) => j !== i))
                }}>Remove</Btn></RegisterCell>
              </RegisterRow>
            ) : (
              <RegisterRow key={i}>
                <RegisterCell align="left" nowrap={false} className="text-trs-ink">{r.item}</RegisterCell>
                <RegisterCell align="left" nowrap={false} className="text-trs-muted">{r.detail || '—'}</RegisterCell>
                <RegisterCell className="text-trs-muted">{r.seen || '—'}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      {draft && <div className="flex items-center justify-end gap-2 border-t border-trs-line px-4 py-3">
        <Btn className="mr-auto" onClick={() => setDraft(d => d && [...d, { item: '', detail: '', seen: '' }])}>Add row</Btn>
        {err && <span className="text-small text-trs-neg">{err}</span>}
        <Btn onClick={() => setDraft(null)}>Cancel</Btn>
        <Btn level="primary" loading={busy} onClick={async () => {
          setBusy(true); const e = await save(part, draft); setBusy(false)
          if (e) setErr(e); else { setDraft(null); setNote(`Saved · version ${n + 1}`) }
        }}>Confirm</Btn>
      </div>}
    </Card>
  )
}
