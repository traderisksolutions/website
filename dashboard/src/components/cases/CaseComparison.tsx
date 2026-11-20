'use client'

/**
 * Comparison for a renewal case: the current policy beside each option on offer. A person types
 * every cell from the insurer's document, marks how each option meets each wish, and names the
 * option recommended. Code subtracts the current premium from each option's and counts the
 * must-have wishes met. Client summary is the saved comparison as a PDF. No model is called.
 */
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Empty, Field, Spinner, textareaCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { DASH, fmtDay } from '@/lib/format'
import { actorName } from '@/lib/cases/names'
import {
  CELL_MAX, CURRENT, LABEL_MAX, METS, MET_NAME, NAME_MAX, NEED_NAME, OPTIONS_MAX, PREMIUM, REASON_MAX, ROWS_MAX,
  byNeed, changeText, isMet, offered, premiumLines, wishCounts, type CompareOption, type Comparison, type Met,
} from '@/lib/cases/compare'
import type { CompareAnswer } from '@/app/api/work/[id]/compare/route'
import { WishListDialog } from './WishListDialog'
import { headingCls, selectCls } from './shared'
import { Register } from '@/components/ui/register'

/** What a person typed and has not saved, by case: it survives a look at another section. */
const drafts = new Map<string, Comparison>()

const cellCls = 'block w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-body leading-[1.45] text-trs-ink outline-none hover:border-trs-line-2 focus:border-trs-ink placeholder:text-trs-subtle'
const fileKey = (f: { message_id: string; filename: string }) => `${f.message_id}|${f.filename}`
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}`

export function CaseComparison({ id, onOpenThread, onChanged, onNotice, onError }: {
  id: string
  onOpenThread: (threadId: string) => void
  /** The comparison was saved or the wish list changed. */
  onChanged: () => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [view, setView] = useState<CompareAnswer | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [c, setC] = useState<Comparison | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'summary' | null>(null)
  const [wishing, setWishing] = useState(false)
  const [pdf, setPdf] = useState<{ url: string; filename: string } | null>(null)

  useEffect(() => {
    setView(null); setC(null); setFailed(null)
    callApi<CompareAnswer>(`/api/work/${id}/compare`).then(v => {
      const draft = drafts.get(id)
      setView(v); setC(draft ?? v.comparison); setDirty(!!draft)
    }).catch(e => setFailed(errText(e)))
  }, [id])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url) }, [pdf])

  const edit = useCallback((fn: (now: Comparison) => Comparison) => {
    setC(now => {
      if (!now) return now
      const next = fn(now)
      drafts.set(id, next)
      return next
    })
    setDirty(true)
  }, [id])

  if (failed) return <Empty compact>{failed}</Empty>
  if (!view || !c) return <Spinner label="Loading the comparison…" />

  const working = busy !== null
  const setOption = (optionId: string, patch: Partial<CompareOption>) => edit(now => ({ ...now, options: now.options.map(o => (o.id === optionId ? { ...o, ...patch } : o)) }))
  const addOption = () => edit(now => ({ ...now, options: [...now.options, { id: newId('o'), name: `Option ${offered(now) + 1}`, insurer: null, file: null }] }))
  const removeOption = (optionId: string) => edit(now => ({ ...now, options: now.options.filter(o => o.id !== optionId), recommended: now.recommended === optionId ? null : now.recommended }))
  const setCell = (rowId: string, optionId: string, text: string) => edit(now => ({ ...now, rows: now.rows.map(r => (r.id === rowId ? { ...r, cells: { ...r.cells, [optionId]: text } } : r)) }))
  const setLabel = (rowId: string, label: string) => edit(now => ({ ...now, rows: now.rows.map(r => (r.id === rowId ? { ...r, label } : r)) }))
  const addRow = () => edit(now => ({ ...now, rows: [...now.rows.filter(r => r.id !== PREMIUM), { id: newId('r'), label: '', cells: {} }, ...now.rows.filter(r => r.id === PREMIUM)] }))
  const removeRow = (rowId: string) => edit(now => ({ ...now, rows: now.rows.filter(r => r.id !== rowId) }))
  const setMark = (wishId: string, optionId: string, mark: Met | null) => edit(now => {
    const rest = Object.fromEntries(Object.entries(now.wishes[wishId] ?? {}).filter(([k]) => k !== optionId))
    return { ...now, wishes: { ...now.wishes, [wishId]: mark ? { ...rest, [optionId]: mark } : rest } }
  })
  const discard = () => { drafts.delete(id); setC(view.comparison); setDirty(false) }

  async function save() {
    setBusy('save'); onError(null)
    try {
      const v = await callApi<CompareAnswer>(`/api/work/${id}/compare`, { method: 'PUT', body: { comparison: c } })
      drafts.delete(id)
      setView(v); setC(v.comparison); setDirty(false)
      onNotice('Comparison saved.')
      onChanged()
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }

  // The route sits behind the API gate: a plain link carries no key, a fetch from the page does.
  async function summary() {
    setBusy('summary'); onError(null)
    try {
      const r = await fetch(`/api/work/${id}/compare/summary`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Client summary failed (${r.status})`)
      const filename = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Renewal-comparison.pdf'
      setPdf({ url: URL.createObjectURL(await r.blob()), filename })
    } catch (e) { onError(errText(e)) } finally { setBusy(null) }
  }
  function download() {
    if (!pdf) return
    const a = document.createElement('a')
    a.href = pdf.url; a.download = pdf.filename
    a.click()
  }

  /** The wish list is the case's notes: read it back without touching what is typed here. */
  async function closeWishes() {
    setWishing(false)
    try {
      const v = await callApi<CompareAnswer>(`/api/work/${id}/compare`)
      setView(now => (now ? { ...now, wishes: v.wishes } : v))
      onChanged()
    } catch (e) { onError(errText(e)) }
  }

  const wishes = byNeed(view.wishes)
  const lines = premiumLines(c)
  const counts = wishCounts(wishes, c)
  const anyMust = wishes.some(w => w.need === 'must')
  const terms = c.rows.filter(r => r.id !== PREMIUM)
  const premium = c.rows.find(r => r.id === PREMIUM)
  const gridWidth = 200 + c.options.length * 230 + 44
  const optionName = (o: CompareOption) => (o.insurer ? `${o.name} · ${o.insurer}` : o.name)

  return (
    <section aria-label="Comparison" className="flex flex-col gap-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <p className="m-0 text-body text-trs-muted">
          {dirty ? 'Unsaved changes' : view.saved ? `Saved by ${actorName(view.saved.by, view.staff)} on ${fmtDay(view.saved.at)}` : 'Not saved'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <Btn level="tertiary" disabled={working} onClick={discard}>Discard changes</Btn>}
          <Btn disabled={working || dirty || !view.saved} loading={busy === 'summary'} title={dirty || !view.saved ? 'Save the comparison first' : undefined} onClick={() => void summary()}>Client summary</Btn>
          <Btn level="primary" disabled={working || !dirty} loading={busy === 'save'} onClick={() => void save()}>Save</Btn>
        </div>
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={headingCls}>Options · {offered(c)}</h2>
          <Btn size="xs" disabled={working || c.options.length >= OPTIONS_MAX} onClick={addOption}>Add option</Btn>
        </div>
        <Register label="Options" minWidth={700} dense={false} className="[&_table]:table-fixed">
            <colgroup><col className="w-[160px]" /><col className="w-[170px]" /><col /><col className="w-[176px]" /></colgroup>
            <thead><tr><th>Option</th><th>Insurer</th><th>Source document</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {c.options.map(o => {
                const withheld = !!o.file && !o.file.filename
                const picked = o.file && !withheld ? view.files.find(f => fileKey(f) === fileKey(o.file!)) : undefined
                return (
                  <tr key={o.id} className="align-middle">
                    <td className="px-1.5 py-1.5">
                      {o.id === CURRENT ? <span className="block px-2 text-body text-trs-ink">{o.name}</span>
                        : <input className={cellCls} aria-label="Option name" maxLength={NAME_MAX} value={o.name} onChange={e => setOption(o.id, { name: e.target.value })} />}
                    </td>
                    <td className="px-1.5 py-1.5"><input className={cellCls} aria-label={`Insurer for ${o.name}`} placeholder="Insurer" maxLength={80} value={o.insurer ?? ''} onChange={e => setOption(o.id, { insurer: e.target.value || null })} /></td>
                    <td className="px-2 py-1.5">
                      <select className={`${selectCls} w-full`} aria-label={`Source document for ${o.name}`} value={o.file ? (withheld ? 'withheld' : fileKey(o.file)) : ''}
                        onChange={e => { const f = view.files.find(x => fileKey(x) === e.target.value); setOption(o.id, { file: f ? { message_id: f.message_id, filename: f.filename } : null }) }}>
                        <option value="">No document</option>
                        {withheld && <option value="withheld">Colleague’s mailbox · file name withheld</option>}
                        {o.file && !withheld && !picked && <option value={fileKey(o.file)}>{o.file.filename}</option>}
                        {view.files.map((f, i) => <option key={`${fileKey(f)}-${i}`} value={fileKey(f)}>{[f.filename, f.type, f.at ? fmtDay(f.at) : null].filter(Boolean).join(' · ')}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1.5">
                        {picked && <Btn size="xs" onClick={() => onOpenThread(picked.thread_id)}>Open email</Btn>}
                        {o.id !== CURRENT && <Btn size="xs" disabled={working} onClick={() => removeOption(o.id)} aria-label={`Remove ${o.name}`}>Remove</Btn>}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Register>
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={headingCls}>Policy terms</h2>
          <Btn size="xs" disabled={working || c.rows.length >= ROWS_MAX} onClick={addRow}>Add term</Btn>
        </div>
        <Register label="Policy terms" minWidth={gridWidth} dense={false} className="[&_table]:table-fixed">
            <colgroup><col className="w-[200px]" />{c.options.map(o => <col key={o.id} />)}<col className="w-[44px]" /></colgroup>
            <thead><tr><th>Term</th>{c.options.map(o => <th key={o.id}>{optionName(o)}</th>)}<th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {terms.map(r => (
                <tr key={r.id} className="align-top">
                  <td className="px-1.5 py-1.5"><input className={`${cellCls} font-medium`} aria-label="Term" placeholder="Term" maxLength={LABEL_MAX} value={r.label} onChange={e => setLabel(r.id, e.target.value)} /></td>
                  {c.options.map(o => (
                    <td key={o.id} className="px-1.5 py-1.5">
                      <textarea className={`${cellCls} resize-y`} rows={2} aria-label={`${r.label || 'Term'}: ${o.name}`} maxLength={CELL_MAX} value={r.cells[o.id] ?? ''} onChange={e => setCell(r.id, o.id, e.target.value)} />
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-center">
                    <Btn level="tertiary" size="xs" disabled={working} onClick={() => removeRow(r.id)} aria-label={`Remove term ${r.label || 'without a name'}`} className="w-8 px-0 text-heading leading-none">×</Btn>
                  </td>
                </tr>
              ))}
              {premium && (
                <tr className="align-top">
                  <td className="px-1.5 py-1.5"><span className="block border border-transparent px-2 py-1.5 text-body leading-[1.45] font-medium text-trs-ink">{premium.label}</span></td>
                  {c.options.map((o, n) => (
                    <td key={o.id} className="px-1.5 py-1.5">
                      <input className={`${cellCls} tabular-nums`} inputMode="decimal" aria-label={`${premium.label}: ${o.name}`} placeholder="0.00" maxLength={40} value={premium.cells[o.id] ?? ''} onChange={e => setCell(PREMIUM, o.id, e.target.value)} />
                      {o.id !== CURRENT && <span className="block px-2 pt-0.5 text-left text-small tabular-nums text-trs-muted" aria-label={`Change from current policy: ${o.name}`}>{changeText(lines[n]) ?? DASH}</span>}
                    </td>
                  ))}
                  <td />
                </tr>
              )}
            </tbody>
          </Register>
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={headingCls}>Client wish list · {wishes.length}</h2>
          <Btn size="xs" disabled={working} onClick={() => setWishing(true)}>Edit wish list</Btn>
        </div>
        {wishes.length === 0 ? <Empty compact>No wishes on the case.</Empty> : (
          <Register label="Client wish list by option" minWidth={380 + c.options.length * 160} dense={false} className="[&_table]:table-fixed">
              <colgroup><col /><col className="w-[120px]" />{c.options.map(o => <col key={o.id} className="w-[160px]" />)}</colgroup>
              <thead><tr><th>Wish</th><th>Need</th>{c.options.map(o => <th key={o.id}>{o.name}</th>)}</tr></thead>
              <tbody>
                {wishes.map(w => (
                  <tr key={w.id} className="align-middle">
                    <td className="cell-left px-3 py-2 text-body leading-[1.5] break-words">{w.text}</td>
                    <td className="cell-left px-3 py-2 text-body">{w.need ? NEED_NAME[w.need] : <span className="text-trs-muted">Not graded</span>}</td>
                    {c.options.map(o => (
                      <td key={o.id} className="px-2 py-1.5">
                        <select className={`${selectCls} w-full`} aria-label={`${o.name}: ${w.text}`} value={c.wishes[w.id]?.[o.id] ?? ''} onChange={e => setMark(w.id, o.id, isMet(e.target.value) ? e.target.value : null)}>
                          <option value="">{DASH}</option>
                          {METS.map(m => <option key={m} value={m}>{MET_NAME[m]}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
                {anyMust && (
                  <tr>
                    <td className="cell-left px-3 py-2 text-body font-medium" colSpan={2}>Must have met</td>
                    {counts.map(k => <td key={k.option} className="cell-left px-3 py-2 text-body tabular-nums">{k.must.met} of {k.must.of}</td>)}
                  </tr>
                )}
              </tbody>
            </Register>
        )}
      </div>

      <div className="flex flex-col gap-2 min-w-0 max-w-[720px]">
        <h2 className={headingCls}>Recommendation</h2>
        <Field label="Recommended option">
          <select className={`${selectCls} w-full sm:w-[320px]`} value={c.recommended ?? ''} onChange={e => edit(now => ({ ...now, recommended: e.target.value || null }))}>
            <option value="">None</option>
            {c.options.map(o => <option key={o.id} value={o.id}>{optionName(o)}</option>)}
          </select>
        </Field>
        <Field label="Reason">
          <textarea className={textareaCls} rows={4} maxLength={REASON_MAX} value={c.note ?? ''} onChange={e => edit(now => ({ ...now, note: e.target.value || null }))} />
        </Field>
      </div>

      <WishListDialog caseId={wishing ? id : null} title={view.item.title} onClose={() => void closeWishes()} />

      <Dialog open={pdf !== null} onOpenChange={o => { if (!o) setPdf(null) }}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-[1040px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Client summary</DialogTitle>
            <DialogDescription className="sr-only">The saved comparison as a PDF.</DialogDescription>
          </DialogHeader>
          {pdf && <iframe title="Client summary PDF" src={pdf.url} className="w-full h-[68vh] rounded border border-trs-line bg-white" />}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Btn onClick={() => setPdf(null)}>Close</Btn>
            <Btn level="primary" onClick={download}>Download</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
