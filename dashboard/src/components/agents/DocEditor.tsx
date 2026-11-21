'use client'

/**
 * One versioned text (AI Agents › Instructions and Knowledge): edit and save as the next version,
 * read an old version, restore it as the newest. An empty text opens on the suggested draft, which is
 * sent nowhere until saved.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn, textareaCls } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { fmtDateTime } from '@/lib/format'
import { unwrap } from '@/lib/action-result'
import { restoreVersion, saveDocument } from '@/app/agents/actions'
import type { DocVersion } from '@/lib/agents/knowledge'

export function DocEditor({ docKey, title, versions, draft }: { docKey: string; title: string; versions: DocVersion[]; draft: string }) {
  const router = useRouter()
  const current = versions[0] ?? null
  const [text, setText] = useState(current?.body ?? draft)
  const [viewing, setViewing] = useState<DocVersion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = !current || text !== current.body

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); setViewing(null); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const shown = viewing ?? null
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-heading font-medium">{title}</h2>
          <div className="text-small text-trs-muted">{current ? `Version ${current.version} · ${fmtDateTime(current.created_at)} · ${current.created_by}` : 'Not saved · not read by the agents'}</div>
        </div>
        <div className="flex gap-2">
          {shown
            ? <><Btn onClick={() => setViewing(null)}>Back to latest</Btn><Btn level="primary" loading={busy} onClick={() => void run(async () => unwrap(await restoreVersion(docKey, shown.version)))}>{`Restore version ${shown.version}`}</Btn></>
            : <Btn level="primary" loading={busy} disabled={!changed || !text.trim()} onClick={() => void run(async () => unwrap(await saveDocument(docKey, text)))}>{`Save version ${(current?.version ?? 0) + 1}`}</Btn>}
        </div>
      </div>
      <textarea aria-label={title} className={`${textareaCls} min-h-80 font-mono`} spellCheck readOnly={!!shown} /* drift-ok: no shared textarea; textareaCls is the house style */
        value={shown ? shown.body : text} onChange={e => setText(e.target.value)} />
      <div className="text-small text-trs-muted" role="status">{shown ? `Viewing version ${shown.version}, read only` : changed ? 'Unsaved changes' : 'No changes'}</div>
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
      {versions.length > 0 && (
        <Register label="Versions" minWidth={560}>
          <RegisterHead><RegisterTh first width={110}>Version</RegisterTh><RegisterTh>Saved</RegisterTh><RegisterTh>By</RegisterTh><RegisterTh>Lines</RegisterTh><RegisterTh last> </RegisterTh></RegisterHead>
          <tbody>
            {versions.map(v => (
              <RegisterRow key={v.version}>
                <RegisterCell first primary={v === current ? `${v.version} · latest` : String(v.version)} />
                <RegisterCell>{fmtDateTime(v.created_at)}</RegisterCell>
                <RegisterCell>{v.created_by}</RegisterCell>
                <RegisterCell>{v.body.split('\n').length}</RegisterCell>
                <RegisterCell last>{v === current ? '' : <Btn size="xs" onClick={() => setViewing(v)}>View</Btn>}</RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </section>
  )
}
