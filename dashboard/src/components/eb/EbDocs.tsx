'use client'

/**
 * Step 1 · Pricing, one documents column (Jarod's approved design, 20 Nov 2026): heading, the Add
 * box, the files Added (each with its own action and Remove), and the files found on the company's
 * filed threads, each with Add.
 */
import { Btn } from '@/components/crm/primitives'
import { AddBox } from '@/components/ui/add-box'
import { fmtDate } from '@/lib/format'

export type FoundFile = { attachment_id: string; filename: string; at: string; subject: string | null }

const kindOf = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'file').slice(0, 4).toUpperCase()

export function FileRow({ name, meta, children }: { name: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-trs-line py-2 text-body">
      <span aria-hidden className="grid h-9 w-8 flex-none place-items-center rounded bg-trs-field text-small text-trs-muted">{kindOf(name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-trs-ink">{name}</span>
        {meta && <span className="block text-small text-trs-muted">{meta}</span>}
      </span>
      {children && <span className="flex flex-none items-center gap-1.5">{children}</span>}
    </div>
  )
}

export function DocColumn({ id, title, add, added, found, company, onAddFound, isAdded, busyId }: {
  id: string; title: string
  add: { label: string; types: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (f: File[]) => void }
  added: React.ReactNode[]
  found: FoundFile[]; company: string
  onAddFound: (f: FoundFile) => void; isAdded: (f: FoundFile) => boolean; busyId?: string | null
}) {
  return (
    <section className="flex min-w-0 flex-col" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="m-0 mb-2 text-center text-body font-semibold">{title}</h3>
      <AddBox id={`${id}-add`} {...add} />
      <div className="mt-3">
        <div className="text-small text-trs-muted">Added</div>
        {added.length ? added : <div className="py-2 text-body text-trs-muted">None yet</div>}
      </div>
      <div className="mt-3.5">
        <div className="text-small text-trs-muted">{company ? `From ${company}’s email` : 'From the thread’s email'}</div>
        {found.length ? found.map(f => {
          const on = isAdded(f)
          return (
            <FileRow key={f.attachment_id} name={f.filename} meta={`${fmtDate(f.at)}${f.subject ? ` · ${f.subject}` : ''}`}>
              <Btn size="xs" aria-pressed={on} loading={busyId === f.attachment_id} disabled={on || busyId === f.attachment_id} onClick={() => onAddFound(f)}>{on ? 'Added' : 'Add'}</Btn>
            </FileRow>
          )
        }) : <div className="py-2 text-body text-trs-muted">None found in filed threads</div>}
      </div>
    </section>
  )
}
