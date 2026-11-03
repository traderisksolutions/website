'use client'

/**
 * The renewal method: one plain-text file the renewal agents read on every run. Thresholds and
 * overrides drive the rules; the whole text goes to the AI agents. Beside the text, what the
 * rules understood, so a line they could not read is visible before it matters.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip } from '@/components/crm/primitives'
import type { RenewalMethod } from '@/lib/methods/method'

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
    const r = await fetch(`/api/methods/renewal${view ? `?version=${view}` : ''}`, { cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) { setMsg(j.error ?? 'Could not load the renewal method'); return }
    setData(j); setDraft(j.text)
  }, [view])
  useEffect(() => { void load() }, [load])

  async function save(body: Record<string, unknown>) {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/methods/renewal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not save')
      setMsg(`Saved as version ${j.version}. The agents use it from their next run.`); setEditing(false); setView(null); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (!data) return <p className="text-[13.5px] text-trs-muted">{msg ?? 'Loading…'}</p>
  const p = data.parsed
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-trs-muted">
        <Chip tone="blue">{data.isDefault ? 'Default method' : `Version ${data.current?.version}`}</Chip>
        {data.current && <span>{data.current.created_by?.split('@')[0]} · {day(data.current.created_at)}</span>}
        {data.migrationPending && <Chip tone="amber">Saving needs migration 20261103_agent_methods</Chip>}
        <span className="flex-1" />
        {isAdmin && !editing && <Btn size="sm" level="secondary" onClick={() => setEditing(true)}>Edit</Btn>}
        {editing && <><Btn size="sm" level="tertiary" onClick={() => { setEditing(false); setDraft(data.text) }}>Cancel</Btn><Btn size="sm" level="primary" disabled={busy} onClick={() => void save({ text: draft })}>Save as new version</Btn></>}
        {view && isAdmin && <Btn size="sm" level="secondary" disabled={busy} onClick={() => void save({ restore: view })}>Restore this version</Btn>}
      </div>
      {msg && <p className="m-0 text-[13.5px] text-trs-ink">{msg}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <textarea value={draft} onChange={e => setDraft(e.target.value)} readOnly={!editing} spellCheck={false} aria-label="Renewal method"
          className="w-full min-h-[560px] rounded-[10px] border border-trs-line bg-white p-4 font-mono text-[13px] leading-[1.6] text-trs-ink outline-none focus:border-trs-green" />
        <aside className="flex flex-col gap-4 text-[13px] min-w-0">
          <div>
            <h3 className="m-0 mb-2 text-[13px] font-semibold text-trs-ink">What the rules read</h3>
            <table className="w-full"><tbody className="[&_td]:py-1 [&_td:last-child]:text-right [&_td:last-child]:tabular-nums">
              <tr><td>Hold below loss ratio</td><td>{pct(p.holdBelow)}</td></tr>
              <tr><td>Increase above loss ratio</td><td>{pct(p.increaseAbove)}</td></tr>
              <tr><td>Exposure change that adjusts</td><td>{pct(p.exposureShift)}</td></tr>
              <tr><td>No claims on file</td><td>{p.noClaimsUnknown ? 'Unknown' : 'Clean'}</td></tr>
              <tr><td>Clients always marketed</td><td>{p.marketClients.length}</td></tr>
              <tr><td>Lines always marketed</td><td>{p.marketLines.map(l => LINE[l] ?? l).join(', ') || '0'}</td></tr>
              <tr><td>Insurer and market notes</td><td>{p.insurerNotes.length}</td></tr>
              <tr><td>Line notes</td><td>{Object.keys(p.lineNotes).length}</td></tr>
            </tbody></table>
          </div>
          {p.unread.length > 0 && (
            <div>
              <h3 className="m-0 mb-2 text-[13px] font-semibold text-trs-neg">Lines the rules could not read · {p.unread.length}</h3>
              <ul className="m-0 pl-4 flex flex-col gap-1 text-trs-muted">{p.unread.map((u, i) => <li key={i} className="break-words">{u}</li>)}</ul>
            </div>
          )}
          {data.versions.length > 0 && (
            <div>
              <h3 className="m-0 mb-2 text-[13px] font-semibold text-trs-ink">Versions</h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {data.versions.map(v => (
                  <li key={v.version}><button type="button" onClick={() => setView(v.version === data.versions[0]?.version ? null : v.version)}
                    className={`bg-transparent border-0 p-0 cursor-pointer text-left text-[13px] ${(view ?? data.versions[0]?.version) === v.version ? 'text-trs-ink font-medium' : 'text-trs-muted'} hover:underline`}>
                    Version {v.version} · {v.created_by?.split('@')[0]} · {day(v.created_at)}</button></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
