'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Btn, LinkBtn, btnClass } from '@/components/crm/primitives'
import { MarketingPage, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { fmtDate, fmtDay, n } from '@/lib/marketing/labels'
import type { KnowledgeVersion, KnowledgeVersionMeta } from '@/lib/marketing/knowledge-file'
import type { SiteSummary } from '@/lib/marketing/types'

type Payload = {
  site: SiteSummary
  current: KnowledgeVersion | null
  versions: KnowledgeVersionMeta[]
  viewing: KnowledgeVersion | null
  migrationPending?: boolean
}

const MIGRATION_LINE = 'Migration 20261019_marketing_v2 is not applied yet.'
const PLACEHOLDER = '# Business\nOne fact per line. The writer states only what is written here.\n# Approved claims\n# Do not write'
const BOX = 'block w-full m-0 rounded border px-5 py-[18px] min-h-[520px] font-mono text-body leading-[1.65] text-trs-ink-2'
const SECONDARY_LINK = cn(btnClass('secondary', 'xs'), 'no-underline')

/** A word that acts, inside a line of text: the tertiary button with no box. */
const LINK_BTN = 'h-auto px-0 border-0 font-normal text-small text-trs-muted hover:bg-transparent hover:text-trs-muted hover:underline'

const author = (email: string | null | undefined) => (email ? email.split('@')[0] : 'unknown')

export default function KnowledgePage() {
  return <Suspense fallback={null}><Knowledge /></Suspense>
}

/** One plain-text file per site. Read only until Edit; every save is a new version. */
function Knowledge() {
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [viewingVersion, setViewingVersion] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    if (!siteKey) return
    const id = ++reqId.current
    setLoading(true)
    try {
      const q = viewingVersion ? `&version=${viewingVersion}` : ''
      const res = await fetch(`/api/marketing/knowledge/file?site=${siteKey}${q}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load the knowledge file')
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [siteKey, viewingVersion])
  useEffect(() => { void load() }, [load])

  // A new site: back to the current version, read only.
  useEffect(() => { setMode('read'); setViewingVersion(null); setStatus(null); setError(null) }, [siteKey])
  useEffect(() => { if (mode === 'edit') textareaRef.current?.focus() }, [mode])

  const site = data?.site
  const current = data?.current ?? null
  const viewing = data?.viewing ?? null
  const text = viewing?.text ?? ''
  const nextVersion = (current?.version ?? 0) + 1
  const isCurrent = viewingVersion === null || viewingVersion === current?.version
  const changed = draft !== (current?.text ?? '')

  const post = useCallback(async (payload: Record<string, unknown>) => {
    if (!siteKey) return null
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/marketing/knowledge/file?site=${siteKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not save')
      return j.version as number
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null }
    finally { setBusy(false) }
  }, [siteKey])

  const startEdit = () => { setDraft(current?.text ?? ''); setStatus(null); setMode('edit') }
  const cancelEdit = () => { setMode('read'); setDraft('') }
  const save = async () => {
    if (!changed || busy) return
    const v = await post({ text: draft })
    if (v === null) return
    setMode('read'); setDraft(''); setViewingVersion(null); setStatus(`Saved as version ${v}`)
    void load()
  }
  const restore = async (version: number) => {
    if (busy) return
    const v = await post({ restore: version })
    if (v === null) return
    setViewingVersion(null); setStatus(`Saved as version ${v}`)
    void load()
  }
  const view = (version: number) => { setStatus(null); setViewingVersion(version === current?.version ? null : version) }

  const line = !site ? 'Loading…'
    : data?.migrationPending ? site.name
    : !current ? `${site.name} · no file yet`
    : `${site.name} · version ${current.version} · ${n(current.word_count)} words · ${n(current.heading_count)} ${current.heading_count === 1 ? 'heading' : 'headings'} · saved ${fmtDate(current.created_at, true)} by ${author(current.created_by)}`

  const state = status ? status
    : mode === 'edit' ? `knowledge.txt · editing version ${current?.version ?? 0}`
    : !isCurrent && viewing ? `Viewing version ${viewing.version} · read only`
    : current ? `knowledge.txt · version ${current.version} · read only`
    : 'knowledge.txt · empty'

  const sectionsLink = <LinkBtn href={withSite('/marketing/knowledge/entries', siteKey)} level="tertiary">Sections</LinkBtn>
  const actions = !data || data.migrationPending ? sectionsLink
    : mode === 'edit' ? <>
        <Btn onClick={cancelEdit} disabled={busy}>Cancel</Btn>
        <Btn level="primary" onClick={save} disabled={!changed} loading={busy}>Save as version {nextVersion}</Btn>
      </>
    : !isCurrent && viewing ? <>
        <Btn onClick={() => view(current?.version ?? 0)} disabled={busy}>Back to current</Btn>
        <Btn level="primary" onClick={() => restore(viewing.version)} loading={busy}>Restore as version {nextVersion}</Btn>
      </>
    : <>
        {sectionsLink}
        {current && <a className={SECONDARY_LINK} href={`data:text/plain;charset=utf-8,${encodeURIComponent(current.text)}`} download={`knowledge-${siteKey}-v${current.version}.txt`}>Download .txt</a>}
        <Btn level="primary" onClick={startEdit} disabled={loading && !data}>Edit</Btn>
      </>

  return (
    <MarketingPage title="Knowledge" line={line} sites={sites} siteKey={siteKey} onSite={setSiteKey} actions={actions}>
      {error && <Note role="alert">{error}</Note>}
      {data?.migrationPending ? <Note role="status">{MIGRATION_LINE}</Note> : (
        <div className={cn('grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]', loading && 'opacity-60')}>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5 text-small text-trs-muted">
              <span role="status">{state}</span>
              <span>Lines starting with # are headings; each heading is one fact the writer may cite</span>
            </div>
            {mode === 'edit' ? (
              <textarea
                ref={textareaRef}
                aria-label="Knowledge file"
                className={cn(BOX, 'border-trs-line-2 bg-white resize-y outline-none focus:border-trs-ink placeholder:text-trs-subtle')}
                value={draft}
                placeholder={PLACEHOLDER}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save() } }}
                maxLength={200_000}
                spellCheck={false}
              />
            ) : (
              <pre className={cn(BOX, 'whitespace-pre-wrap break-words bg-trs-tint border-trs-line', text ? 'text-trs-ink-2' : 'text-trs-muted')}>
                {text || (data && !current ? PLACEHOLDER : '')}
              </pre>
            )}
          </div>

          <aside className="min-w-0">
            <h3 className="m-0 mb-2.5 text-body font-medium text-trs-muted">Versions</h3>
            {data && data.versions.length === 0 ? (
              <p className="m-0 text-body text-trs-muted">No versions yet.</p>
            ) : (
              <ul className="list-none m-0 p-0">
                {(data?.versions ?? []).map(v => {
                  const cur = v.version === current?.version
                  const on = isCurrent ? cur : v.version === viewingVersion
                  const locked = busy || mode === 'edit'
                  return (
                    <li key={v.version} className={cn('flex items-center justify-between gap-2.5 px-2.5 py-[9px] rounded text-body', on && 'bg-trs-soft')}>
                      <span className="min-w-0">
                        v{v.version}
                        {cur ? ' · current' : (
                          <span className="ml-2 text-small text-trs-muted">
                            <Btn level="tertiary" size="xs" className={LINK_BTN} disabled={locked} onClick={() => view(v.version)}>view</Btn>
                            {' · '}
                            <Btn level="tertiary" size="xs" className={LINK_BTN} disabled={locked} onClick={() => restore(v.version)}>restore</Btn>
                          </span>
                        )}
                      </span>
                      <span className="text-small whitespace-nowrap text-trs-muted">{fmtDay(v.created_at)}, {author(v.created_by)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </MarketingPage>
  )
}
