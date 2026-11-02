'use client'

/**
 * A company's knowledge log: every email, document, policy, claim and case event the Knowledge
 * depositor has recorded, newest first, each with links to the thread or the data-room file.
 * Filters by kind; 50 at a time.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip, Segmented, Spinner, Empty } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { ThreadModal, fmtWhen } from './shared'
import type { NextStep } from '@/lib/today/data'

type Entry = {
  id: string; occurred_at: string; kind: string; title: string; summary: string | null; party: string | null
  actor: string | null; links: { label: string; url: string }[]; thread_id: string | null
}
type Filter = 'all' | 'email' | 'document' | 'policy' | 'case'

const KIND: Record<string, string> = {
  email_in: 'Email in', email_out: 'Email out', email_rebuilt: 'Rebuilt email', document: 'Document', policy: 'Policy',
  debit_note: 'Debit note', claim: 'Claim', case: 'Case', fact: 'Fact', note: 'Note',
}
const IN_FILTER: Record<Filter, (k: string) => boolean> = {
  all: () => true, email: k => k.startsWith('email'), document: k => k === 'document',
  policy: k => k === 'policy' || k === 'debit_note', case: k => k === 'case' || k === 'claim' || k === 'fact' || k === 'note',
}

export function CompanyKnowledge({ companyId }: { companyId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [steps, setSteps] = useState<NextStep[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thread, setThread] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const page = useCallback(async (before: string | null) => {
    setBusy(true)
    try {
      const d = await callApi<{ entries: Entry[]; next: string | null; next_steps?: NextStep[] }>(`/api/today/knowledge/${companyId}${before ? `?before=${encodeURIComponent(before)}` : ''}`)
      setEntries(e => before ? [...(e ?? []), ...d.entries] : d.entries); setNext(d.next)
      if (!before) setSteps(d.next_steps ?? [])
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }, [companyId])
  useEffect(() => { void page(null) }, [page])

  const shown = (entries ?? []).filter(e => IN_FILTER[filter](e.kind))
  return (
    <div className="flex flex-col gap-3 min-w-0">
      {steps.length > 0 && (
        <section className="flex flex-col gap-2 min-w-0 mb-2" aria-label="Next steps">
          <h2 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-trs-muted">Next steps</h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {steps.map(st => {
              const lane = st.needs_human ? 'Decide' : st.has_draft ? 'Send' : st.status === 'trs_to_act' || st.status === 'stalled' ? 'Act' : 'Waiting'
              return (
                <li key={st.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 items-start text-[13px]">
                  <Chip tone={lane === 'Decide' ? 'red' : lane === 'Send' ? 'green' : lane === 'Act' ? 'amber' : 'neutral'}>{lane}</Chip>
                  <div className="min-w-0">
                    <a href={`/today/${st.id}`} className="text-trs-ink no-underline hover:underline">{st.title}</a>
                    <div className="text-trs-ink-2">{st.needs_human ?? st.next_action ?? 'No next action recorded'}</div>
                    <div className="text-[12px] text-trs-muted">{[st.owner_email ? st.owner_email.split('@')[0] : 'unowned', st.deadline ? `due ${fmtWhen(st.deadline)}` : null, st.waiting_since ? `waiting since ${fmtWhen(st.waiting_since)}` : null].filter(Boolean).join(' · ')}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<Filter> value={filter} onChange={setFilter} label="Kind" options={[
          { value: 'all', label: 'All' }, { value: 'email', label: 'Email' }, { value: 'document', label: 'Documents' },
          { value: 'policy', label: 'Policies' }, { value: 'case', label: 'Cases' },
        ]} />
        {entries && <span className="text-[12.5px] text-trs-muted">{entries.length}{next ? '+' : ''} entries</span>}
      </div>
      {error && <p className="m-0 text-[13.5px] text-trs-neg">{error}</p>}
      {!entries ? <Spinner label="Loading the knowledge log…" /> : shown.length === 0 ? <Empty>Nothing recorded for this company yet.</Empty> : (
        <ol className="m-0 p-0 list-none rounded-[10px] border border-trs-line bg-white overflow-hidden">
          {shown.map(e => (
            <li key={e.id} className="grid grid-cols-1 sm:grid-cols-[112px_minmax(0,1fr)] gap-1 sm:gap-3 px-4 py-2.5 border-b border-trs-line last:border-b-0">
              <span className="font-mono text-[11.5px] text-trs-muted pt-[3px]">{fmtWhen(e.occurred_at)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={e.kind === 'email_rebuilt' ? 'amber' : 'neutral'}>{KIND[e.kind] ?? e.kind}</Chip>
                  <button type="button" onClick={() => setOpen(o => o === e.id ? null : e.id)} aria-expanded={open === e.id}
                    className="bg-transparent border-0 p-0 text-left cursor-pointer text-[13.5px] text-trs-ink hover:underline min-w-0 break-words">{e.title}</button>
                </div>
                {e.actor && <div className="text-[12px] text-trs-muted break-all">{e.actor}{e.party ? ` · ${e.party}` : ''}</div>}
                {open === e.id && e.summary && <pre className="m-0 mt-1.5 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-trs-ink-2">{e.summary}</pre>}
                {(e.thread_id || e.links.length > 0) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[12.5px]">
                    {e.thread_id && <button type="button" onClick={() => setThread(e.thread_id)} className="bg-transparent border-0 p-0 cursor-pointer text-trs-muted hover:text-trs-ink underline">Thread</button>}
                    {e.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-trs-muted hover:text-trs-ink">{l.label}</a>)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {next && <div><Btn size="xs" loading={busy} onClick={() => void page(next)}>Load older</Btn></div>}
      <ThreadModal threadId={thread} onClose={() => setThread(null)} />
    </div>
  )
}
