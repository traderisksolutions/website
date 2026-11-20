'use client'

/**
 * One file on a Today email: its name (opens the file in a new tab) and Remove, asked in place.
 * One component per file so a check on the file (a flag beside the name) slots in through `flag`
 * without touching the list around it.
 */
import { FileText } from 'lucide-react'
import { previewHref, type DeskAttachment } from '@/lib/today/desk'
import { InlineConfirm } from './InlineConfirm'

export function AttachmentRow({ file, onRemove, busy = false, flag }: {
  file: DeskAttachment & { document_id?: string | null }
  onRemove?: () => void | Promise<void>
  busy?: boolean
  /** A check on this file, shown beside its name. */
  flag?: React.ReactNode
}) {
  const href = previewHref(file)
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]" data-attachment={file.filename}>
      <FileText size={14} className="flex-none text-trs-muted" aria-hidden />
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-trs-ink underline-offset-[3px] hover:underline" title={`Open ${file.filename}`}>{file.filename}</a>
        : <span className="min-w-0 truncate font-medium text-trs-ink">{file.filename}</span>}
      {flag}
      {onRemove && <span className="ml-auto"><InlineConfirm label="Remove" question={`Remove ${file.filename}?`} action="Remove" onConfirm={onRemove} busy={busy} /></span>}
    </li>
  )
}
