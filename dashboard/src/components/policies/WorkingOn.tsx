'use client'

/**
 * Policies › Working on (19 Nov 2026, the Workbench revamp): one row per client with the number of
 * policies TRS is working on; opening a client lists them, each linked to its email thread, with
 * Existing, renewal, previous premium and the two stages a person can set. Add from emails puts new
 * ones on the list; Remove asks first. Reads /api/placements/working; writes /api/placements/lines/[id].
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Btn, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { useConfirm } from '@/components/ui/confirm'
import { fmtDate, num, fmtDateTime } from '@/lib/format'
import { CLIENT_STAGES, INSURER_STAGES, REQUEST_TYPES, daysTo, type ClientStage, type InsurerStage } from '@/lib/placement/working'
import { AddFromEmails } from './AddFromEmails'

export type WorkingRow = {
  line_id: string; placement_id: string; policy_id: string | null; company_id: string; company_name: string
  label: string; product_line: string; request_type: string | null; existing: boolean | null
  renewal_date: string | null; previous_premium: number | null
  client_stage: ClientStage; insurer_stage: InsurerStage; client_set: boolean; insurer_set: boolean
  quoted: string[]; waiting: string[]; declined: string[]
  thread_id: string | null; thread_subject: string | null; received: string
}

const typeWord = (t: string | null) => REQUEST_TYPES.find(([k]) => k === t)?.[1] ?? null
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)

/** Done steps green, the current one ink, the rest a hairline. */
const stepCls = (i: number, at: number) => (i < at ? 'bg-trs-green' : i === at ? 'bg-trs-ink' : 'bg-trs-line-2')

function Track({ at }: { at: number }) {
  return (
    <span className="flex gap-[3px] w-[90px] mb-1.5" aria-hidden>
      {[0, 1, 2, 3, 4].map(i => <i key={i} className={`flex-1 h-1 rounded ${stepCls(i, at)}`} />)}
    </span>
  )
}

function StageSelect<T extends string>({ value, list, label, onChange }: { value: T; list: readonly (readonly [T, string])[]; label: string; onChange: (v: T) => void }) {
  return (
    <select value={value} aria-label={label} onChange={e => onChange(e.target.value as T)}
      className="h-8 rounded border border-trs-line-2 bg-white px-2 text-body text-trs-ink cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-trs-green">
      {list.map(([k, w]) => <option key={k} value={k}>{w}</option>)}
    </select>
  )
}

/** Policies › Working on; with `company`, the Company page's Working on tab: that client's table only. */
export function WorkingOn({ filters, company }: { filters?: React.ReactNode; company?: { id: string; name: string } }) {
  const [rows, setRows] = useState<WorkingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState<React.ReactNode>(null)
  const [adding, setAdding] = useState<{ company?: { id: string; name: string } } | null>(null)
  const confirm = useConfirm()

  const load = useCallback(async () => {
    const r = await fetch('/api/placements/working', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'Could not load the policies being worked on'); return }
    setRows(j.rows); setError(null)
  }, [])
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; rows: WorkingRow[] }>()
    for (const r of rows ?? []) { if (company && r.company_id !== company.id) continue; const g = m.get(r.company_id) ?? { id: r.company_id, name: r.company_name, rows: [] }; g.rows.push(r); m.set(r.company_id, g) }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, company])

  async function patch(r: WorkingRow, body: Record<string, unknown>, words: string) {
    const res = await fetch(`/api/placements/lines/${r.line_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setNote(<span className="text-trs-neg">{j.error ?? 'Could not save'}</span>); return false }
    setNote(<span className="text-trs-pos">✓ Saved · {words} · {fmtDateTime(new Date().toISOString())}</span>)
    await load(); return true
  }
  async function remove(r: WorkingRow) {
    if (!(await confirm({ title: `Remove ${r.label} for ${r.company_name}?`, body: 'It comes off Policies › Working on. The email thread and the log stay.', action: 'Remove', danger: true }))) return
    await patch(r, { status: 'dropped' }, `${r.label} removed`)
  }

  const takenThreads = useMemo(() => new Set((rows ?? []).map(r => r.thread_id).filter((x): x is string => !!x)), [rows])
  const d = today()

  const policyTable = (g: { id: string; name: string; rows: WorkingRow[] }) => (
                    <Register label={`Policies being worked on for ${g.name}`} minWidth={1060}>
                      <RegisterHead>
                        <RegisterTh first>Policy</RegisterTh><RegisterTh>Existing</RegisterTh><RegisterTh>Renewal</RegisterTh><RegisterTh>Previous premium S$</RegisterTh>
                        <RegisterTh>Client side</RegisterTh><RegisterTh>Insurer side</RegisterTh><RegisterTh last> </RegisterTh>
                      </RegisterHead>
                      <tbody>
                        {g.rows.map(r => {
                          const days = daysTo(r.renewal_date, d)
                          const ci = CLIENT_STAGES.findIndex(([k]) => k === r.client_stage), ii = INSURER_STAGES.findIndex(([k]) => k === r.insurer_stage)
                          return (
                            <RegisterRow key={r.line_id}>
                              <RegisterCell first identityWidth={260} nowrap={false}>
                                {r.thread_id
                                  ? <Link href={`/engagement?lead=${r.thread_id}`} className="block text-body font-medium text-trs-ink underline decoration-trs-line-2 underline-offset-[3px]" title="Open the email thread">{r.label} ↗</Link>
                                  : <span className="block text-body font-medium text-trs-ink">{r.label}</span>}
                                <span className="block text-small text-trs-muted">{typeWord(r.request_type) ?? 'Type not set'}</span>
                                {r.thread_subject && <span className="block text-small text-trs-muted truncate">Email · {r.thread_subject}</span>}
                                <Link href={`/policies/working/${r.line_id}`} className="text-small text-trs-green underline underline-offset-[3px]">Policy page</Link>
                              </RegisterCell>
                              <RegisterCell primary={r.existing == null ? '—' : r.existing ? 'Yes' : 'No'} />
                              <RegisterCell primary={r.renewal_date ? fmtDate(r.renewal_date) : '—'} secondary={days != null ? <span className={days <= 21 ? 'text-trs-neg' : ''}>{days} days</span> : undefined} />
                              <RegisterCell primary={r.previous_premium != null ? num(r.previous_premium, 0) : '—'} />
                              <RegisterCell nowrap={false}>
                                <div className="flex flex-col items-center"><Track at={ci} />
                                  <StageSelect value={r.client_stage} list={CLIENT_STAGES} label={`Client side, ${r.label}`} onChange={v => void patch(r, { client_stage: v }, `${r.label} client side ${CLIENT_STAGES.find(([k]) => k === v)?.[1]}`)} /></div>
                              </RegisterCell>
                              <RegisterCell nowrap={false}>
                                <div className="flex flex-col items-center"><Track at={ii} />
                                  <StageSelect value={r.insurer_stage} list={INSURER_STAGES} label={`Insurer side, ${r.label}`} onChange={v => void patch(r, { insurer_stage: v }, `${r.label} insurer side ${INSURER_STAGES.find(([k]) => k === v)?.[1]}`)} />
                                  {(r.quoted.length > 0 || r.waiting.length > 0 || r.declined.length > 0) && (
                                    <span className="mt-1.5 max-w-[260px] whitespace-normal text-small text-trs-muted">
                                      {[r.quoted.length ? <span key="q" className="text-trs-pos">{r.quoted.join(', ')} quoted</span> : null,
                                        r.waiting.length ? <span key="w">{r.waiting.join(', ')} waiting</span> : null,
                                        r.declined.length ? <span key="d" className="text-trs-neg">{r.declined.join(', ')} declined</span> : null]
                                        .filter(Boolean).flatMap((x, i) => i ? [' · ', x] : [x])}
                                    </span>)}
                                </div>
                              </RegisterCell>
                              <RegisterCell last>
                                <Btn level="tertiary" size="xs" aria-label={`Remove ${r.label}`} onClick={() => void remove(r)}><X size={14} /></Btn>
                              </RegisterCell>
                            </RegisterRow>
                          )
                        })}
                      </tbody>
                    </Register>
  )

  const added = async (n: number, cos: string[], lineIds: string[]) => {
    setAdding(null); setOpen(o => ({ ...o, ...Object.fromEntries(cos.map(c => [c, true])) })); await load()
    setNote(<span className="inline-flex items-center gap-3"><span className="text-trs-pos">✓ Added {n} {n === 1 ? 'policy' : 'policies'} · {fmtDateTime(new Date().toISOString())}</span>
      <Btn level="tertiary" size="xs" onClick={async () => {
        await Promise.all(lineIds.map(id => fetch(`/api/placements/lines/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dropped' }) })))
        setNote(<span className="text-trs-muted">Undone · {n} {n === 1 ? 'policy' : 'policies'} taken off the list</span>); await load()
      }}>Undo</Btn></span>)
  }
  const addModal = adding && <AddFromEmails company={adding.company} taken={takenThreads} onClose={() => setAdding(null)} onAdded={added} />

  if (company) {
    const g = groups[0] ?? { id: company.id, name: company.name, rows: [] }
    return (
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-body text-trs-muted">{rows ? `${g.rows.length} ${g.rows.length === 1 ? 'policy' : 'policies'} working on` : 'Loading'}</span>
          <Btn onClick={() => setAdding({ company })}>Add from emails</Btn>
        </div>
        {note && <div className="text-body" role="status">{note}</div>}
        {error && <div className="text-body text-trs-neg">{error}</div>}
        {!rows && !error && <Spinner label="Loading the policies being worked on" />}
        {rows && (g.rows.length ? policyTable(g) : <div className="rounded border border-trs-line-2 px-4 py-8 text-center text-body text-trs-muted">No policies being worked on. Add one from an email thread.</div>)}
        {addModal}
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0">
      <PageHeader title="Policies" meta={rows ? `${groups.length} ${groups.length === 1 ? 'client' : 'clients'} · ${rows.length} ${rows.length === 1 ? 'policy' : 'policies'} working on` : 'Loading'}
        actions={<>
          <span className="inline-flex flex-col items-center gap-0.5"><Btn disabled title="Pending AI build">AI read emails</Btn><span className="text-small text-trs-muted">Pending AI build</span></span>
          <Btn level="primary" onClick={() => setAdding({})}>Add from emails</Btn>
        </>}>
        {filters}
      </PageHeader>
      {note && <div className="text-body" role="status">{note}</div>}
      {error && <div className="text-body text-trs-neg">{error}</div>}
      {!rows && !error && <Spinner label="Loading the policies being worked on" />}
      {rows && (
        <Register label="Clients with policies being worked on" minWidth={480}>
          <RegisterHead><RegisterTh first>Company</RegisterTh><RegisterTh last>Policies working on</RegisterTh></RegisterHead>
          <tbody>
            {groups.length === 0 && <RegisterEmpty colSpan={2}>No policies are being worked on. Add one from an email thread.</RegisterEmpty>}
            {groups.map(g => {
              const isOpen = !!open[g.id]
              return [
                <RegisterRow key={g.id} selected={isOpen} onClick={() => setOpen(o => ({ ...o, [g.id]: !o[g.id] }))}>
                  <RegisterCell first identityWidth={320} primary={<span className="inline-flex items-center gap-2">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{g.name}</span>} />
                  <RegisterCell last primary={g.rows.length} />
                </RegisterRow>,
                isOpen && (
                  <tr key={g.id + ':detail'} className="reg-group"><td colSpan={2} className="cell-left px-4 pt-1 pb-4 bg-white">
                    {policyTable(g)}
                    <Btn size="xs" level="tertiary" className="mt-2" onClick={() => setAdding({ company: { id: g.id, name: g.name } })}>+ Add policy for {g.name}</Btn>
                  </td></tr>
                ),
              ]
            })}
          </tbody>
        </Register>
      )}
      {addModal}
    </div>
  )
}
