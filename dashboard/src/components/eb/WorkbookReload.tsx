'use client'

/**
 * The house workbook on Quotation register › Insurers: the file /eb prices from, when Drive last
 * changed it, when it was imported, and Reload workbook (POST /api/eb/workbook). /eb also re-imports
 * on its own when the Drive file is newer than the import. No model is called.
 */
import { useEffect, useState } from 'react'
import { Btn } from '@/components/crm/primitives'
import { fmtDateTime } from '@/lib/format'
import { headingCls } from '@/components/cases/shared'

type File = { name: string; driveFileId: string | null; modifiedAt: string | null; readAt: string }

export function WorkbookReload() {
  const [file, setFile] = useState<File | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/eb/workbook', { cache: 'no-store' }).then(r => r.json()).then((d: { file?: File | null }) => setFile(d.file ?? null)).catch(() => setFile(null))
  }, [])
  async function reload() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/eb/workbook', { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { file?: File; error?: string }
      if (!res.ok || !d.file) { setError(d.error ?? `The workbook was not reloaded (${res.status}).`); return }
      setFile(d.file)
    } catch (e) { setError(e instanceof Error ? e.message : 'The workbook was not reloaded.') } finally { setBusy(false) }
  }
  return (
    <section aria-labelledby="eb-workbook-h" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="eb-workbook-h" className={headingCls}>House workbook</h2>
        <Btn size="xs" loading={busy} disabled={busy} onClick={() => void reload()}>Reload workbook</Btn>
      </div>
      <p className="m-0 text-body text-trs-muted">
        {file === undefined ? 'Reading…' : file === null ? 'Not imported' : `${file.name} · changed in Drive ${fmtDateTime(file.modifiedAt)} · imported ${fmtDateTime(file.readAt)}`}
      </p>
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
    </section>
  )
}
