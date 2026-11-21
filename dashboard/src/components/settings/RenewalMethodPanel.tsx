'use client'

/**
 * The renewal method: one plain-text file the renewal agents read on every run. Thresholds and
 * overrides drive the rules; the whole text goes to the AI agents. Beside the text, what the
 * rules understood, so a line they could not read is visible before it matters.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip, textareaCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import type { RenewalMethod } from '@/lib/methods/method'
import { unwrap } from '@/lib/action-result'
import { methodVersions, saveMethod } from '@/app/settings/actions'

type Meta = { version: number; created_by: string | null; created_at: string }
type Data = { text: string; parsed: RenewalMethod; versions: Meta[]; current: (Meta & { text: string }) | null; isDefault: boolean; migrationPending?: boolean }
const pct = (r: number) => `${Math.round(r * 100)}%`
const day = (s: string) => new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
const LINE: Record<string, string> = { wica: 'WICA', fwmi: 'FWMI', eb: 'Employee benefits', gpa: 'Group personal accident', pi: 'Professional indemnity', do: 'D&O', cyber: 'Cyber', property: 'Property', liability: 'Liability', marine: 'Marine', motor: 'Motor', car: 'Construction all risks', bond: 'Bonds', trade_credit: 'Trade credit', travel: 'Travel' }

export function RenewalMethodPanel({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [view, setView] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await methodVersions('renewal', view ?? undefined)
    if (!r.ok) { setMsg(r.error); return }
    const j = r.data
    setData(j); setDraft(j.text)
  }, [view])
  useEffect(() => { void load() }, [load])

  async function save(body: Record<string, unknown>) {
    setBusy(true); setMsg(null)
    try {
      const j = unwrap(await saveMethod('renewal', body))
      setMsg(`Saved as version ${j.version}. The agents use it from their next run.`); setEditing(false); setView(null); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (!data) return <p className="text-body text-trs-muted">{msg ?? 'Loading…'}</p>
  const p = data.parsed
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-body text-trs-muted">
        <Chip tone="blue">{data.isDefault ? 'Default method' : `Version ${data.current?.version}`}</Chip>
        {data.current && <span>{data.current.created_by?.split('@')[0]} · {day(data.current.created_at)}</span>}
        {data.migrationPending && <Chip tone="amber">Saving needs migration 20261103_agent_methods</Chip>}
        <span className="flex-1" />
        {isAdmin && !editing && <Btn size="sm" level="secondary" onClick={() => setEditing(true)}>Edit</Btn>}
        {editing && <><Btn size="sm" level="tertiary" onClick={() => { setEditing(false); setDraft(data.text) }}>Cancel</Btn><Btn size="sm" level="primary" disabled={busy} onClick={() => void save({ text: draft })}>Save as new version</Btn></>}
        {view && isAdmin && <Btn size="sm" level="secondary" disabled={busy} onClick={() => void save({ restore: view })}>Restore this version</Btn>}
      </div>
      {msg && <p className="m-0 text-body text-trs-ink">{msg}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <textarea value={draft} onChange={e => setDraft(e.target.value)} readOnly={!editing} spellCheck={false} aria-label="Renewal method" rows={24}
          className={cn(textareaCls, 'border-trs-line p-4 font-mono leading-[1.6] resize-none focus:border-trs-green')} />
        <aside className="flex flex-col gap-4 text-body min-w-0">
          <div>
            <h3 className="m-0 mb-2 text-body font-semibold text-trs-ink">What the rules read</h3>
            <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 [&_dd]:m-0 [&_dd]:text-right [&_dd]:tabular-nums [&_dd]:break-words">
              <dt>Hold below loss ratio</dt><dd>{pct(p.holdBelow)}</dd>
              <dt>Increase above loss ratio</dt><dd>{pct(p.increaseAbove)}</dd>
              <dt>Exposure change that adjusts</dt><dd>{pct(p.exposureShift)}</dd>
              <dt>No claims on file</dt><dd>{p.noClaimsUnknown ? 'Unknown' : 'Clean'}</dd>
              <dt>Clients always marketed</dt><dd>{p.marketClients.length}</dd>
              <dt>Lines always marketed</dt><dd>{p.marketLines.map(l => LINE[l] ?? l).join(', ') || '0'}</dd>
              <dt>Insurer and market notes</dt><dd>{p.insurerNotes.length}</dd>
              <dt>Line notes</dt><dd>{Object.keys(p.lineNotes).length}</dd>
            </dl>
          </div>
          {p.unread.length > 0 && (
            <div>
              <h3 className="m-0 mb-2 text-body font-semibold text-trs-neg">Lines the rules could not read · {p.unread.length}</h3>
              <ul className="m-0 pl-4 flex flex-col gap-1 text-trs-muted">{p.unread.map((u, i) => <li key={i} className="break-words">{u}</li>)}</ul>
            </div>
          )}
          {data.versions.length > 0 && (
            <div>
              <h3 className="m-0 mb-2 text-body font-semibold text-trs-ink">Versions</h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {data.versions.map(v => (
                  <li key={v.version}><Btn level="tertiary" size="xs" onClick={() => setView(v.version === data.versions[0]?.version ? null : v.version)}
                    className={cn('h-auto p-0 border-0 justify-start text-left whitespace-normal font-normal hover:bg-transparent hover:underline', (view ?? data.versions[0]?.version) === v.version ? 'text-trs-ink font-medium' : 'text-trs-muted hover:text-trs-muted')}>
                    Version {v.version} · {v.created_by?.split('@')[0]} · {day(v.created_at)}</Btn></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
