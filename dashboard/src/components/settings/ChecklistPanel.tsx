'use client'

/**
 * Document checklists: what a quote needs before it goes to market. The basic list is checked on
 * every renewal and quote case; a line's own list adds to it. Each document is Required or Optional.
 * One table per list. A list is a draft until a person confirms it; any edit returns it to draft.
 * Documents are retired, never deleted, so the calls made on past cases keep their meaning.
 */
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Chip, Empty, Field, Spinner, inputCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { selectCls } from '@/components/cases/shared'
import { DASH, fmtDay } from '@/lib/format'
import { actorName, type Staff } from '@/lib/cases/names'
import { FOUND_BY, FOUND_BY_NAME, LABEL_MAX, checklistLine, lineName, type ChecklistItem, type FoundBy } from '@/lib/cases/checklist'
import type { ChecklistList } from '@/lib/cases/brief-store'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { Register } from '@/components/ui/register'

type Data = { lists: ChecklistList[]; staff: Staff[]; doc_types: { slug: string; label: string }[] }
type Draft = { line: string; id: string | null; label: string; found_by: FoundBy; doc_types: string[]; words: string; required: boolean }
const wordsOf = (text: string) => text.split(',').map(w => w.trim()).filter(Boolean)

export function ChecklistPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [newLine, setNewLine] = useState('')

  const load = useCallback(() => callApi<Data>('/api/settings/checklists'), [])
  useEffect(() => { load().then(setData).catch(e => setFailed(errText(e))) }, [load])

  if (failed) return <p className="m-0 text-body text-trs-neg" role="alert">{failed}</p>
  if (!data) return <Spinner label="Loading checklists…" />

  async function send(key: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, onFail: (m: string) => void = setError): Promise<boolean> {
    setBusy(key); setError(null)
    try {
      setData(await callApi<Data>('/api/settings/checklists', { method, body }))
      return true
    } catch (e) { onFail(errText(e)); return false } finally { setBusy(null) }
  }
  async function save() {
    if (!draft) return
    setDraftError(null)
    const item = { label: draft.label, found_by: draft.found_by, doc_types: draft.doc_types, words: wordsOf(draft.words), required: draft.required }
    const ok = draft.id
      ? await send('save', 'PATCH', { id: draft.id, ...item }, setDraftError)
      : await send('save', 'POST', { action: 'item', line: draft.line, ...item }, setDraftError)
    if (ok) setDraft(null)
  }
  const edit = (i: ChecklistItem) => { setDraftError(null); setDraft({ line: i.line, id: i.id, label: i.label, found_by: i.found_by, doc_types: i.doc_types, words: i.words.join(', '), required: i.required }) }
  const typeName = new Map(data.doc_types.map(t => [t.slug, t.label]))
  const says = (i: ChecklistItem) => [...i.doc_types.map(t => typeName.get(t) ?? t), ...i.words.map(w => `“${w}”`)].join(', ')
  const held = new Set(data.lists.map(l => l.line))
  const free = PRODUCT_LINES.filter(p => checklistLine(p.slug) === p.slug && !held.has(p.slug))

  return (
    <div className="flex flex-col gap-6 min-w-0">
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
      {data.lists.map(l => (
        <section key={l.line} aria-label={l.name} className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <h3 className="m-0 flex flex-wrap items-center gap-2 text-body font-semibold text-trs-ink">
              {l.name}
              {l.confirmed_by
                ? <Chip tone="green">Confirmed · {actorName(l.confirmed_by, data.staff)}{l.confirmed_at ? ` · ${fmtDay(l.confirmed_at)}` : ''}</Chip>
                : <Chip tone="amber">Draft</Chip>}
            </h3>
            <span className="flex flex-wrap gap-1.5">
              <Btn size="xs" disabled={busy !== null} onClick={() => { setDraftError(null); setDraft({ line: l.line, id: null, label: '', found_by: 'file', doc_types: [], words: '', required: true }) }}>Add document</Btn>
              {!l.confirmed_by && <Btn size="xs" disabled={busy !== null || !l.items.some(i => i.active)} loading={busy === `confirm:${l.line}`} onClick={() => void send(`confirm:${l.line}`, 'POST', { action: 'confirm', line: l.line })}>Confirm list</Btn>}
            </span>
          </div>
          {l.items.length === 0 ? <Empty compact>No document on this list.</Empty> : (
            <Register label={`${l.name} documents`} minWidth={760}>
                <thead><tr><th>Document</th><th>Need</th><th>Found by</th><th>File name says</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>
                  {l.items.map(i => (
                    <tr key={i.id} className={i.active ? 'align-top' : 'align-top opacity-50'}>
                      <td className="cell-left min-w-[200px] text-trs-ink">{i.label}</td>
                      <td className="cell-left">
                        <select className={selectCls} aria-label={`${i.label}: required or optional`} value={i.required ? 'required' : 'optional'} disabled={busy !== null}
                          onChange={e => void send(`need:${i.id}`, 'PATCH', { id: i.id, required: e.target.value === 'required' })}>
                          <option value="required">Required</option>
                          <option value="optional">Optional</option>
                        </select>
                      </td>
                      <td className="cell-left whitespace-nowrap">{FOUND_BY_NAME[i.found_by]}</td>
                      <td className="cell-left [overflow-wrap:anywhere]">{says(i) || <span className="text-trs-muted">{DASH}</span>}</td>
                      <td className="whitespace-nowrap">
                        <span className="flex justify-end gap-1.5">
                          <Btn size="xs" level="tertiary" disabled={busy !== null} onClick={() => edit(i)}>Edit</Btn>
                          <Btn size="xs" level="tertiary" disabled={busy !== null} loading={busy === i.id} onClick={() => void send(i.id, 'PATCH', { id: i.id, active: !i.active })}>{i.active ? 'Retire' : 'Use again'}</Btn>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </Register>
          )}
        </section>
      ))}

      {free.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectCls} aria-label="Line of insurance" value={newLine} onChange={e => setNewLine(e.target.value)}>
            <option value="">Choose a line</option>
            {free.map(p => <option key={p.slug} value={p.slug}>{lineName(p.slug)}</option>)}
          </select>
          <Btn size="sm" disabled={!newLine || busy !== null} loading={busy === 'list'} onClick={() => void send('list', 'POST', { action: 'list', line: newLine }).then(ok => { if (ok) setNewLine('') })}>Add list</Btn>
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={o => { if (!o && busy !== 'save') setDraft(null) }}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-[560px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document</DialogTitle>
            <DialogDescription className="sr-only">A document on a checklist.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-3 min-w-0">
              <Field label="Document">
                <input className={inputCls} maxLength={LABEL_MAX} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
              </Field>
              <Field label="Need">
                <select className={`${selectCls} w-full h-9`} value={draft.required ? 'required' : 'optional'} onChange={e => setDraft({ ...draft, required: e.target.value === 'required' })}>
                  <option value="required">Required</option>
                  <option value="optional">Optional</option>
                </select>
              </Field>
              <Field label="Found by">
                <select className={`${selectCls} w-full h-9`} value={draft.found_by} onChange={e => setDraft({ ...draft, found_by: e.target.value as FoundBy })}>
                  {FOUND_BY.map(f => <option key={f} value={f}>{FOUND_BY_NAME[f]}</option>)}
                </select>
              </Field>
              {draft.found_by === 'file' && <>
                <fieldset className="m-0 p-0 border-0 min-w-0">
                  <legend className="block text-small mb-1.5 text-trs-muted">Document types</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    {data.doc_types.map(t => (
                      <label key={t.slug} className="flex items-center gap-2 text-body text-trs-ink min-w-0">
                        <input type="checkbox" checked={draft.doc_types.includes(t.slug)}
                          onChange={e => setDraft({ ...draft, doc_types: e.target.checked ? [...draft.doc_types, t.slug] : draft.doc_types.filter(s => s !== t.slug) })} />
                        <span className="truncate">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Words in the file name, separated by commas">
                  <input className={inputCls} value={draft.words} onChange={e => setDraft({ ...draft, words: e.target.value })} />
                </Field>
              </>}
              {draftError && <p className="m-0 text-body text-trs-neg" role="alert">{draftError}</p>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Btn disabled={busy === 'save'} onClick={() => setDraft(null)}>Cancel</Btn>
            <Btn level="primary" disabled={!draft?.label.trim()} loading={busy === 'save'} onClick={() => void save()}>Save document</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
