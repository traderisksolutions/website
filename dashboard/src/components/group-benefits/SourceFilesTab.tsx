'use client'

/**
 * Pricing Matrix → Source files. Every calculator and brochure in the shared Drive folder, and what
 * each one feeds.
 *
 * The folder is laid out insurer / plan year / files. A file is "In use" when a rate table was read
 * from exactly this version of it, "Changed" when the version in the folder is not the one that was
 * read — the insurer reissued it, or someone replaced it — and "Not read" when nothing has been read
 * from it yet: a new insurer, or a new plan year.
 */

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Loader2 } from 'lucide-react'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'

type Row = {
  driveFileId: string; insurer: string; planYear: string | null; filename: string; kind: string
  bytes: number | null; modifiedAt: string | null; webViewLink: string | null
  status: 'in_use' | 'changed' | 'not_read'; rateTables: { id: string; insurerName: string | null }[]
}
type Payload = { configured: boolean; folderId: string | null; files: Row[]; error?: string }

const STATUS: Record<Row['status'], { label: string; color: string }> = {
  in_use:   { label: 'In use',   color: '#137333' },
  changed:  { label: 'Changed',  color: '#b06000' },
  not_read: { label: 'Not read', color: '#5f6368' },
}
const KIND: Record<string, string> = { calculator: 'Calculator', brochure: 'Brochure', workbook: 'TRS workbook', other: 'Other' }
const CHIP = 'inline-flex items-center rounded-[6px] bg-[#f1f3f4] text-[11.5px] font-medium px-2 py-0.5 whitespace-nowrap'

const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const size = (b: number | null) => b == null ? '—' : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

export function SourceFilesTab() {
  const [d, setD] = useState<Payload | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true)
    try {
      const r = await fetch('/api/group-benefits/sources', { cache: 'no-store' })
      setD(await r.json())
    } catch { setD({ configured: true, folderId: null, files: [], error: 'Could not reach the source folder.' }) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => {
    const c = { in_use: 0, changed: 0, not_read: 0 }
    for (const f of d?.files ?? []) c[f.status]++
    return c
  }, [d])

  if (!d) return <p className="m-0 py-10 text-center text-[15px]" style={{ color: '#5f6368' }}>Reading the source folder…</p>
  if (!d.configured) {
    return (
      <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#5f6368' }}>
        The source folder is not connected. Add GOOGLE_TRS_DRIVE_SA_JSON and GOOGLE_TRS_DRIVE_FOLDER_ID to the deployment.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13.5px] tabular-nums" style={{ color: '#5f6368' }}>
          {d.files.length} files · {counts.in_use} in use · {counts.changed} changed · {counts.not_read} not read
        </p>
        <div className="flex items-center gap-2">
          {d.folderId && (
            <a href={`https://drive.google.com/drive/folders/${d.folderId}`} target="_blank" rel="noopener noreferrer"
               className="h-10 px-4 rounded-[10px] bg-white text-[14px] border border-[#dadce0] inline-flex items-center gap-2 no-underline hover:bg-[#f8f9fa]" style={{ color: '#202124' }}>
              <ExternalLink size={14} /> Open folder
            </a>
          )}
          <button type="button" onClick={load} disabled={busy}
                  className="h-10 px-4 rounded-[10px] bg-white text-[14px] border border-[#dadce0] inline-flex items-center gap-2 cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ color: '#202124' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
      </div>

      {d.error && <p className="m-0 text-[13.5px]" style={{ color: '#c5221f' }}>{d.error}</p>}

      {d.files.length === 0 ? (
        <p className="m-0 py-16 text-center text-[15px]" style={{ color: '#5f6368' }}>
          The folder is empty. Add each insurer&rsquo;s calculator and brochure under insurer / plan year.
        </p>
      ) : (
        <Register label="Source files" minWidth={860}>
          <RegisterHead>
            <RegisterTh first>File</RegisterTh>
            <RegisterTh>Insurer</RegisterTh>
            <RegisterTh>Plan year</RegisterTh>
            <RegisterTh>Status</RegisterTh>
            <RegisterTh>Feeds</RegisterTh>
            <RegisterTh last align="right">Modified</RegisterTh>
          </RegisterHead>
          <tbody>
            {d.files.map(f => (
              <RegisterRow key={f.driveFileId}>
                <RegisterCell first nowrap={false} identityWidth={300}>
                  {f.webViewLink
                    ? <a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="block text-[14.5px] font-medium leading-tight no-underline hover:underline break-words" style={{ color: '#202124' }}>{f.filename}</a>
                    : <span className="block text-[14.5px] font-medium leading-tight break-words" style={{ color: '#202124' }}>{f.filename}</span>}
                  <span className="block text-[12.5px] mt-0.5" style={{ color: '#5f6368' }}>{KIND[f.kind] ?? f.kind} · {size(f.bytes)}</span>
                </RegisterCell>
                <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{f.insurer}</span></RegisterCell>
                <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: '#3c4043' }}>{f.planYear ?? '—'}</span></RegisterCell>
                <RegisterCell><span className={CHIP} style={{ color: STATUS[f.status].color }}>{STATUS[f.status].label}</span></RegisterCell>
                <RegisterCell>
                  {f.rateTables.length
                    ? f.rateTables.map(t => <a key={t.id} href={`/pricing-matrix/${t.id}`} className="block text-[13.5px] no-underline hover:underline" style={{ color: '#202124' }}>{t.insurerName ?? 'Rate table'}</a>)
                    : <span style={{ color: '#9aa0a6' }}>—</span>}
                </RegisterCell>
                <RegisterCell last align="right"><span className="text-[13.5px] tabular-nums" style={{ color: '#5f6368' }}>{day(f.modifiedAt)}</span></RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </div>
  )
}
