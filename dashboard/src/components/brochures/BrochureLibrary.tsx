'use client'

/**
 * Employment Benefits › Brochures (Phase 4 of the Workbench revamp, 19 Nov 2026): every brochure and
 * rate file TRS prices from, one row per product version, newest first within a product. Add version
 * (/brochures/new) and Edit (/brochures/edit?key=<row>) are full pages (20 Nov 2026): they make the
 * version folder in Drive and upload the files straight to it; Remove takes the row off the library
 * and never deletes the Drive files (src/app/api/brochures).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { Btn, Chip, Field, LinkBtn, Segmented, Spinner, btnClass, inputCls } from '@/components/crm/primitives'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { BROCHURE_LINES, STATUS_WORD, nextVersion, type LibraryRow } from '@/lib/brochures/library'

type Data = { rows: LibraryRow[]; drive_url: string | null; saving: boolean; drive: boolean; drive_read: boolean }
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
    <div className="mx-auto w-full px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0 max-w-[1440px]">
      <PageHeader title="Brochures"
        meta={<span className="text-body text-trs-muted">{data ? `${new Set(data.rows.map(r => r.product.toLowerCase())).size} products · ${data.rows.length} versions` : ' '}</span>}
        actions={<>
          {data?.drive_url && <a href={data.drive_url} target="_blank" rel="noreferrer" className={`${btnClass()} no-underline`}>Open Google Drive ↗</a>}
          {data?.saving && data.drive ? <LinkBtn level="primary" href="/brochures/new">Add version</LinkBtn>
            : <Btn level="primary" disabled title={!data?.saving ? NO_TABLE : 'Google Drive is not configured'}>Add version</Btn>}
        </>}>
        {lines.length > 1 && <Segmented<string> value={line} onChange={setLine} label="Line" options={[{ value: 'all', label: 'All', count: data?.rows.length }, ...lines.map(l => ({ value: l, label: l, count: data?.rows.filter(r => r.line === l).length }))]} />}
      </PageHeader>

      {error && <div className="text-body text-trs-neg">{error}</div>}
      {note && <div className="text-body text-trs-pos">{note}</div>}
      {data && !data.drive_read && <div className="text-body text-trs-warn">Google Drive could not be read. Versions saved on this page are shown.</div>}
      {!data && !error && <Spinner label="Loading brochures" />}

      {data && (
        <section className="min-w-0">
          <Register label="Brochure versions" minWidth={960}>
            <RegisterHead>
              <RegisterTh first>Product</RegisterTh>
              <RegisterTh>Line</RegisterTh>
              <RegisterTh width={90}>Version</RegisterTh>
              <RegisterTh width={130}>In force from</RegisterTh>
              <RegisterTh>Files</RegisterTh>
              <RegisterTh width={110}>Status</RegisterTh>
              <RegisterTh width={180} last>Actions</RegisterTh>
            </RegisterHead>
            <tbody>
              {rows.length === 0 && <RegisterEmpty colSpan={7}>No brochures yet.</RegisterEmpty>}
              {rows.map((r, i) => {
                const muted = r.status === 'superseded'
                return (
                  <RegisterRow key={r.key} className={cn(firstOfProduct(i) && 'border-t border-trs-line', muted ? 'text-trs-subtle' : 'text-trs-ink')}>
                    <RegisterCell first className="font-medium">{firstOfProduct(i) ? r.product : ''}</RegisterCell>
                    <RegisterCell align="left">{firstOfProduct(i) || rows[i - 1].line !== r.line ? r.line : ''}</RegisterCell>
                    <RegisterCell>{r.status === 'to_confirm' ? '—' : r.version}</RegisterCell>
                    <RegisterCell>{r.in_force_from ? fmtDate(r.in_force_from) : '—'}</RegisterCell>
                    <RegisterCell align="left" nowrap={false}>
                      {r.files.length === 0 ? <span className="text-trs-muted">No files</span> : (
                        <span className="flex flex-col gap-0.5">{r.files.map(f => (
                          <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className={cn('block break-words no-underline hover:underline', muted ? 'text-trs-subtle' : 'text-trs-ink')}>
                            <span className="mr-1.5 text-small text-trs-muted">{f.kind === 'rates' ? 'Rates' : f.kind === 'brochure' ? 'Brochure' : 'File'}</span>{f.name}</a>))}</span>)}
                      {r.note && <span className="mt-1 block text-small text-trs-muted">{r.note}</span>}
                    </RegisterCell>
                    <RegisterCell><Chip>{STATUS_WORD[r.status]}</Chip></RegisterCell>
                    <RegisterCell last>
                      <span className="inline-flex gap-1.5">
                        {data.saving && r.status !== 'to_confirm' ? <LinkBtn size="xs" href={`/brochures/edit?key=${encodeURIComponent(r.key)}`}>Edit</LinkBtn>
                          : <Btn size="xs" disabled title={!data.saving ? NO_TABLE : 'Move the file into a version folder in Drive'}>Edit</Btn>}
                        <Btn size="xs" disabled={!r.id} title={r.id ? undefined : 'Only versions saved on this page can be removed'} onClick={() => void remove(r)}>Remove</Btn>
                      </span>
                    </RegisterCell>
                  </RegisterRow>
                )
              })}
            </tbody>
          </Register>
        </section>
      )}
    </div>
  )
}

type Progress = { name: string; state: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string }

/** Add version (/brochures/new) or Edit (/brochures/edit?key=<row key>): a full page. */
export function VersionPage({ rowKey }: { rowKey: string | null }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { call<Data>('/api/brochures').then(setData).catch(e => setError(e instanceof Error ? e.message : String(e))) }, [])
  const row = rowKey ? data?.rows.find(r => r.key === rowKey) ?? null : null
  const title = rowKey ? (row ? `${row.product} ${row.version}` : 'Edit version') : 'Add version'
  return (
    <div className="mx-auto w-full px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0 max-w-[760px]">
      <Breadcrumbs current={{ label: title, href: rowKey ? `/brochures/edit?key=${encodeURIComponent(rowKey)}` : '/brochures/new' }} fallback={{ label: 'Brochures', href: '/brochures' }} />
      <PageHeader title={title} />
      {error && <div className="text-body text-trs-neg">{error}</div>}
      {!data && !error && <Spinner label="Loading brochures" />}
      {data && rowKey && !row && <div className="text-body text-trs-neg">This version is not in the library.</div>}
      {data && (!rowKey || row) && <VersionForm row={row} rows={data.rows} />}
    </div>
  )
}

function VersionForm({ row, rows }: { row: LibraryRow | null; rows: LibraryRow[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const onClose = () => router.push('/brochures')
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
      router.push('/brochures')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const ready = (row || (product.trim() && version.trim())) && /^\d{4}-\d{2}-\d{2}$/.test(date)
  async function removeFile(name: string) {
    if (!(await confirm({ title: `Remove ${name}?`, body: 'It is not uploaded. Nothing in Google Drive changes.', action: 'Remove', danger: true }))) return
    setFiles(x => x.filter(y => y.name !== name))
  }
  return (
    <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {!row && <div className="sm:col-span-2"><Field label="Product">
              <Input list="brochure-products" value={product} onChange={e => setProduct(e.target.value)} placeholder="Existing or new product" aria-label="Product" autoFocus />
              <datalist id="brochure-products">{products.map(p => <option key={p} value={p} />)}</datalist>
            </Field></div>}
            <Field label="Line">
              <select className={inputCls} value={lineV} onChange={e => setLineV(e.target.value)} aria-label="Line">{BROCHURE_LINES.map(l => <option key={l}>{l}</option>)}</select>
            </Field>
            <Field label="Version">
              <Input className={cn(row && 'bg-trs-tint text-trs-muted')} value={version} readOnly={!!row} onChange={e => { setTouched(true); setVersion(e.target.value) }} aria-label="Version" />
            </Field>
            <Field label="In force from">
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="In force from" />
            </Field>
            <Field label="Note">
              <Input value={noteV} onChange={e => setNoteV(e.target.value)} aria-label="Note" />
            </Field>
          </div>

          {canAddFiles && <div>
            <div className="mb-1.5 text-body font-medium text-trs-ink">{row ? 'Add files' : 'Brochure and rate file'}</div>
            <label onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
              className={cn('flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded px-4 py-4 text-center text-body', drag ? 'bg-trs-tint' : 'bg-trs-field')}>
              <span className="text-trs-ink">Drop files or choose</span>
              <span className="text-small text-trs-muted">PDF · XLSX</span>
              <input type="file" multiple className="sr-only" aria-label="Files" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>
            {files.length > 0 && <ul className="m-0 mt-2 list-none p-0">{files.map(f => {
              const p = progress.find(x => x.name === f.name)
              return (
                <li key={f.name} className="flex items-center justify-between gap-3 py-1.5 text-body">
                  <span className="min-w-0 truncate text-trs-ink">{f.name} <span className="text-trs-muted">· {(f.size / 1_048_576).toFixed(1)} MB</span></span>
                  {p ? <span className={p.state === 'failed' ? 'text-trs-neg' : 'text-trs-muted'} title={p.error}>{p.state === 'done' ? 'In Drive' : p.state === 'failed' ? 'Failed' : p.state === 'uploading' ? 'Uploading' : 'Waiting'}</span>
                    : <Btn size="xs" level="tertiary" onClick={() => void removeFile(f.name)}>Remove</Btn>}
                </li>)
            })}</ul>}
          </div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            {err && <span className="mr-auto text-small text-trs-neg" role="alert">{err}</span>}
            <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn level="primary" loading={busy} disabled={!ready} onClick={() => void save()}>{row ? 'Save' : 'Add version'}</Btn>
          </div>
    </div>
  )
}
