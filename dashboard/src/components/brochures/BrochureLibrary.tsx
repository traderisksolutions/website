'use client'

/**
 * Employment Benefits › Brochures (Phase 4 of the Workbench revamp, 19 Nov 2026): every brochure and
 * rate file TRS prices from, one row per product version, newest first within a product. Add version
 * makes the version folder in Drive and uploads the files straight to it; Remove takes the row off
 * the library and never deletes the Drive files (src/app/api/brochures).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Btn, Field, Segmented, Spinner, inputCls } from '@/components/crm/primitives'
import { useConfirm } from '@/components/ui/confirm'
import { fmtDate } from '@/lib/format'
import { BROCHURE_LINES, STATUS_WORD, nextVersion, type LibraryRow, type Status } from '@/lib/brochures/library'

type Data = { rows: LibraryRow[]; drive_url: string | null; saving: boolean; drive: boolean; drive_read: boolean }
type Editing = { mode: 'add' } | { mode: 'edit'; row: LibraryRow }

const STATUS_CLS: Record<Status, string> = { in_force: 'text-trs-pos font-medium', scheduled: 'text-trs-ink', superseded: 'text-trs-subtle', to_confirm: 'text-trs-warn', not_dated: 'text-trs-muted' }
const NO_TABLE = 'Saving starts once the brochure versions table is added'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`)
  return j as T
}

export function BrochureLibrary() {
  const confirm = useConfirm()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [line, setLine] = useState('all')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(async (fresh = false) => {
    try { setData(await call<Data>(`/api/brochures${fresh ? '?fresh=1' : ''}`)); setError(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const lines = useMemo(() => BROCHURE_LINES.filter(l => data?.rows.some(r => r.line === l)), [data])
  const rows = (data?.rows ?? []).filter(r => line === 'all' || r.line === line)
  const firstOfProduct = (i: number) => i === 0 || rows[i - 1].product !== rows[i].product

  async function remove(r: LibraryRow) {
    if (!r.id) return
    if (!await confirm({ title: `Remove ${r.product} ${r.version}?`, body: 'It leaves the library. The files stay in Google Drive.', action: 'Remove', danger: true })) return
    try { await call(`/api/brochures?id=${r.id}`, { method: 'DELETE' }); setNote(`Removed ${r.product} ${r.version}`); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0 max-w-[1440px]">
      <PageHeader title="Brochures"
        meta={<span className="text-[13px] text-trs-muted">{data ? `${new Set(data.rows.map(r => r.product.toLowerCase())).size} products · ${data.rows.length} versions` : ' '}</span>}
        actions={<>
          {data?.drive_url && <a href={data.drive_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-[8px] border border-trs-line-2 bg-white px-3.5 text-[14px] font-medium text-trs-ink no-underline">Open Google Drive ↗</a>}
          <Btn level="primary" disabled={!data?.saving || !data.drive} title={!data?.saving ? NO_TABLE : !data.drive ? 'Google Drive is not configured' : undefined} onClick={() => { setNote(null); setEditing({ mode: 'add' }) }}>Add version</Btn>
        </>}>
        {lines.length > 1 && <Segmented<string> value={line} onChange={setLine} label="Line" options={[{ value: 'all', label: 'All', count: data?.rows.length }, ...lines.map(l => ({ value: l, label: l, count: data?.rows.filter(r => r.line === l).length }))]} />}
      </PageHeader>

      {error && <div className="text-[14px] text-trs-neg">{error}</div>}
      {note && <div className="text-[13px] text-trs-pos">{note}</div>}
      {data && !data.drive_read && <div className="text-[13px] text-trs-warn">Google Drive could not be read. Versions saved on this page are shown.</div>}
      {!data && !error && <Spinner label="Loading brochures" />}

      {data && (
        <section className="min-w-0 overflow-hidden rounded-[8px] border border-trs-line-2 bg-white">
          <div className="overflow-x-auto">
            <table className="trs-table w-full min-w-[920px] border-collapse text-[13px]" aria-label="Brochure versions">
              <thead><tr className="border-b border-trs-line text-[12px] text-trs-muted">
                <th className="sticky left-0 z-[1] bg-white px-4 py-2.5 text-left font-medium">Product</th>
                <th className="px-3 py-2.5 text-left font-medium">Line</th>
                <th className="w-[90px] px-3 py-2.5 text-center font-medium">Version</th>
                <th className="w-[130px] px-3 py-2.5 text-center font-medium">In force from</th>
                <th className="px-3 py-2.5 text-left font-medium">Files</th>
                <th className="w-[110px] px-3 py-2.5 text-center font-medium">Status</th>
                <th className="w-[150px] px-3 py-2.5 text-center font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-trs-muted">No brochures yet.</td></tr>}
                {rows.map((r, i) => {
                  const muted = r.status === 'superseded'
                  return (
                    <tr key={r.key} className={`align-middle ${firstOfProduct(i) ? 'border-t border-trs-line' : ''} ${muted ? 'text-trs-subtle' : 'text-trs-ink'}`}>
                      <td className="sticky left-0 z-[1] min-w-[200px] bg-white px-4 py-2.5 font-medium">{firstOfProduct(i) ? r.product : ''}</td>
                      <td className="cell-left whitespace-nowrap px-3 py-2.5">{firstOfProduct(i) || rows[i - 1].line !== r.line ? r.line : ''}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">{r.status === 'to_confirm' ? '—' : r.version}</td>
                      <td className="px-3 py-2.5 text-center">{r.in_force_from ? fmtDate(r.in_force_from) : '—'}</td>
                      <td className="cell-left px-3 py-2.5">
                        {r.files.length === 0 ? <span className="text-trs-muted">No files</span> : (
                          <span className="flex flex-col gap-0.5">{r.files.map(f => (
                            <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className={`truncate no-underline hover:underline ${muted ? 'text-trs-subtle' : 'text-trs-ink'}`}>
                              <span className="mr-1.5 text-[11px] text-trs-muted">{f.kind === 'rates' ? 'Rates' : f.kind === 'brochure' ? 'Brochure' : 'File'}</span>{f.name}</a>))}</span>)}
                        {r.note && <span className="mt-1 block text-[12px] text-trs-muted">{r.note}</span>}
                      </td>
                      <td className={`px-3 py-2.5 text-center ${STATUS_CLS[r.status]}`}>{STATUS_WORD[r.status]}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span className="inline-flex gap-1.5">
                          <Btn size="xs" disabled={!data.saving || r.status === 'to_confirm'} title={!data.saving ? NO_TABLE : r.status === 'to_confirm' ? 'Move the file into a version folder in Drive' : undefined}
                            onClick={() => { setNote(null); setEditing({ mode: 'edit', row: r }) }}>Edit</Btn>
                          <Btn size="xs" disabled={!r.id} title={r.id ? undefined : 'Only versions saved on this page can be removed'} onClick={() => void remove(r)}>Remove</Btn>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && data && <VersionModal editing={editing} rows={data.rows} onClose={() => setEditing(null)}
        onSaved={async words => { setEditing(null); setNote(words); await load(true) }} />}
    </div>
  )
}

type Progress = { name: string; state: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string }

/** Add version, or Edit a row's line, date and note, with files added to its folder. */
function VersionModal({ editing, rows, onClose, onSaved }: { editing: Editing; rows: LibraryRow[]; onClose: () => void; onSaved: (words: string) => Promise<void> }) {
  const row = editing.mode === 'edit' ? editing.row : null
  const products = useMemo(() => [...new Set(rows.map(r => r.product))].sort(), [rows])
  const [product, setProduct] = useState(row?.product ?? '')
  const [lineV, setLineV] = useState(row?.line ?? BROCHURE_LINES[0])
  const [version, setVersion] = useState(row?.version ?? 'v1')
  const [touched, setTouched] = useState(!!row)
  const [date, setDate] = useState(row?.in_force_from ?? '')
  const [noteV, setNoteV] = useState(row?.note ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<Progress[]>([])
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    if (row || touched) return
    setVersion(nextVersion(rows, product))
    const known = rows.find(r => r.product.toLowerCase() === product.trim().toLowerCase())
    if (known) setLineV(known.line)
  }, [product, rows, row, touched])

  // A row that came from Drive only gets a library row when it is first edited.
  const canAddFiles = !row || !!row.id
  const addFiles = (list: FileList | null) => list && setFiles(f => [...f, ...Array.from(list).filter(n => !f.some(x => x.name === n.name))])

  async function upload(id: string) {
    const out: Progress[] = files.map(f => ({ name: f.name, state: 'waiting' }))
    setProgress([...out])
    for (const [i, f] of files.entries()) {
      out[i] = { ...out[i], state: 'uploading' }; setProgress([...out])
      try {
        const { uploadUrl } = await call<{ uploadUrl: string }>(`/api/brochures/${id}/upload-url`, { method: 'POST', body: JSON.stringify({ filename: f.name, mime_type: f.type, size: f.size }) })
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f })
        const g = await put.json().catch(() => ({})) as { id?: string }
        if (!put.ok || !g.id) throw new Error('Google Drive did not accept the file')
        await call('/api/brochures', { method: 'PATCH', body: JSON.stringify({ id, add_file: { id: g.id, name: f.name, mime_type: f.type } }) })
        out[i] = { ...out[i], state: 'done' }
      } catch (e) { out[i] = { ...out[i], state: 'failed', error: e instanceof Error ? e.message : String(e) } }
      setProgress([...out])
    }
    return out.filter(p => p.state === 'failed').length
  }

  async function save() {
    setBusy(true); setErr(null)
    try {
      let id = row?.id ?? null
      if (!row) {
        const j = await call<{ version: { id: string } }>('/api/brochures', { method: 'POST', body: JSON.stringify({ product, line: lineV, version, in_force_from: date, note: noteV }) })
        id = j.version.id
      } else if (!row.id) {
        const j = await call<{ version: { id: string } }>('/api/brochures', { method: 'POST', body: JSON.stringify({ product: row.product, line: lineV, version: row.version, in_force_from: date, note: noteV, adopt: true }) })
        id = j.version.id
      } else {
        await call('/api/brochures', { method: 'PATCH', body: JSON.stringify({ id: row.id, line: lineV, in_force_from: date, note: noteV }) })
      }
      const failed = id && files.length ? await upload(id) : 0
      if (failed) { setErr(`${failed} file${failed === 1 ? '' : 's'} not uploaded. The version is saved; add the files again from Edit.`); return }
      await onSaved(`Saved ${row?.product ?? product} ${row?.version ?? version}${files.length ? ` · ${files.length} file${files.length === 1 ? '' : 's'} in Drive` : ''}`)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const ready = (row || (product.trim() && version.trim())) && /^\d{4}-\d{2}-\d{2}$/.test(date)
  return (
    <DialogPrimitive.Root open onOpenChange={o => { if (!o && !busy) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="trs-modal-overlay fixed inset-0 z-[100]" />
        <DialogPrimitive.Content aria-describedby={undefined} className="trs-modal-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100vh-48px)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[28px] bg-white px-8 pt-7 pb-6 shadow-[0_30px_80px_rgba(15,20,18,0.25)] focus:outline-none">
          <DialogPrimitive.Close aria-label="Close" className="absolute right-[18px] top-[18px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-[#e8e8ed] text-[#3a3a3c] cursor-pointer"><X size={16} /></DialogPrimitive.Close>
          <DialogPrimitive.Title className="m-0 pr-10 text-[24px] font-semibold tracking-[-0.02em] text-trs-ink">{row ? `${row.product} ${row.version}` : 'Add version'}</DialogPrimitive.Title>

          <div className="grid gap-3 sm:grid-cols-2">
            {!row && <div className="sm:col-span-2"><Field label="Product">
              <input className={inputCls} list="brochure-products" value={product} onChange={e => setProduct(e.target.value)} placeholder="Existing or new product" aria-label="Product" autoFocus />
              <datalist id="brochure-products">{products.map(p => <option key={p} value={p} />)}</datalist>
            </Field></div>}
            <Field label="Line">
              <select className={inputCls} value={lineV} onChange={e => setLineV(e.target.value)} aria-label="Line">{BROCHURE_LINES.map(l => <option key={l}>{l}</option>)}</select>
            </Field>
            <Field label="Version">
              <input className={`${inputCls} ${row ? 'bg-trs-tint text-trs-muted' : ''}`} value={version} readOnly={!!row} onChange={e => { setTouched(true); setVersion(e.target.value) }} aria-label="Version" />
            </Field>
            <Field label="In force from">
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} aria-label="In force from" />
            </Field>
            <Field label="Note">
              <input className={inputCls} value={noteV} onChange={e => setNoteV(e.target.value)} aria-label="Note" />
            </Field>
          </div>

          {canAddFiles && <div>
            <div className="mb-1.5 text-[12.5px] text-trs-muted">{row ? 'Add files' : 'Brochure and rate file'}</div>
            <label onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
              className={`flex min-h-[84px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed px-4 py-4 text-center text-[13px] ${drag ? 'border-trs-green bg-trs-tint' : 'border-trs-line-2'}`}>
              <span className="text-trs-ink">Drop files or choose</span>
              <span className="text-[12px] text-trs-muted">PDF brochure, Excel rate file</span>
              <input type="file" multiple className="sr-only" aria-label="Files" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>
            {files.length > 0 && <ul className="m-0 mt-2 list-none p-0">{files.map(f => {
              const p = progress.find(x => x.name === f.name)
              return (
                <li key={f.name} className="flex items-center justify-between gap-3 border-b border-trs-line py-1.5 text-[13px] last:border-b-0">
                  <span className="min-w-0 truncate text-trs-ink">{f.name} <span className="text-trs-muted">· {(f.size / 1_048_576).toFixed(1)} MB</span></span>
                  {p ? <span className={p.state === 'failed' ? 'text-trs-neg' : p.state === 'done' ? 'text-trs-pos' : 'text-trs-muted'} title={p.error}>{p.state === 'done' ? 'In Drive' : p.state === 'failed' ? 'Failed' : p.state === 'uploading' ? 'Uploading' : 'Waiting'}</span>
                    : <Btn size="xs" onClick={() => setFiles(x => x.filter(y => y.name !== f.name))}>Remove</Btn>}
                </li>)
            })}</ul>}
          </div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            {err && <span className="mr-auto text-[12.5px] text-trs-neg">{err}</span>}
            <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn level="primary" loading={busy} disabled={!ready} onClick={() => void save()}>{row ? 'Confirm' : 'Add version'}</Btn>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
