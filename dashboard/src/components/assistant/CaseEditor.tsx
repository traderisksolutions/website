'use client'

/**
 * Edits on the review screen. CaseEditor changes the case itself (title, client, policy, type,
 * status, owner, deadline, next step, insurer, the pending level); every save is one POST to
 * /api/work/:id/edit and lands in the case's timeline. AttachmentPicker adds data-room files
 * to a draft and removes files from it.
 */
import { useEffect, useState } from 'react'
import { Btn, Chip, Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { CASE_TYPES, STATUSES, type ItemDetail, type ItemEdit } from '@/lib/today/data'
import { LEVEL_LABEL, type PendingLevel } from '@/lib/today/pending'
import { CASE_TYPE, STATUS } from './shared'

type Options = { staff: { email: string; name: string }[]; policies: { id: string; label: string }[]; companies: { id: string; name: string }[] }

const selectCls = `${inputCls} appearance-none`

export function CaseEditor({ item, onSaved, onError }: { item: ItemDetail; onSaved: (notice: string) => void; onError: (msg: string) => void }) {
  const [form, setForm] = useState<ItemEdit>({
    title: item.title, company_id: item.company_id, policy_id: item.policy_id, case_type: item.case_type, status: item.status,
    owner_email: item.owner_email, deadline: item.deadline, deadline_basis: null, next_action: item.next_action, insurer_name: item.insurer_name,
    pending_override: item.pending.override?.level ?? null, pending_override_reason: item.pending.override?.reason ?? null,
  })
  const [client, setClient] = useState<{ id: string | null; name: string }>({ id: item.company_id, name: item.client })
  const [query, setQuery] = useState('')
  const [opts, setOpts] = useState<Options>({ staff: [], policies: [], companies: [] })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams()
    if (form.company_id) q.set('company_id', form.company_id)
    if (query.trim().length >= 2) q.set('q', query.trim())
    const t = setTimeout(() => { callApi<Options>(`/api/today/edit-options?${q}`).then(setOpts).catch(e => onError(errText(e))) }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [form.company_id, query, onError])

  const set = <K extends keyof ItemEdit>(k: K, v: ItemEdit[K]) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setBusy(true)
    try {
      // Only what changed goes over the wire, so the timeline shows real edits.
      const diff: ItemEdit = {}
      const was: ItemEdit = { title: item.title, company_id: item.company_id, policy_id: item.policy_id, case_type: item.case_type, status: item.status, owner_email: item.owner_email, deadline: item.deadline, next_action: item.next_action, insurer_name: item.insurer_name, pending_override: item.pending.override?.level ?? null, pending_override_reason: item.pending.override?.reason ?? null }
      for (const k of Object.keys(form) as (keyof ItemEdit)[]) if ((form[k] ?? null) !== (was[k] ?? null)) (diff as Record<string, unknown>)[k] = form[k] ?? null
      if (form.deadline_basis && diff.deadline === undefined) delete diff.deadline_basis
      if (!Object.keys(diff).length) { onSaved('Nothing changed.'); return }
      const r = await callApi<{ changes: Record<string, unknown> }>(`/api/work/${item.id}/edit`, { method: 'POST', body: { item: diff } })
      const n = Object.keys(r.changes).length
      onSaved(n ? `Saved ${n} change${n === 1 ? '' : 's'}.` : 'Nothing changed.')
    } catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <form className="flex flex-col gap-3 pt-2 border-t border-trs-line" onSubmit={e => { e.preventDefault(); void save() }} aria-label="Edit case">
      <Field label="Title"><input className={inputCls} value={form.title ?? ''} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="Client" hint={client.id ? undefined : 'No client on this case'}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5"><Chip tone={client.id ? 'neutral' : 'amber'}>{client.name}</Chip>{client.id !== item.company_id && <span className="text-[12px] text-trs-muted">changed</span>}</div>
          <input className={inputCls} placeholder="Search clients to refile" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search clients" />
          {opts.companies.length > 0 && (
            <ul className="m-0 p-0 list-none rounded-[7px] border border-trs-line bg-white max-h-[180px] overflow-auto">
              {opts.companies.map(c => (
                <li key={c.id}><button type="button" onClick={() => { setClient({ id: c.id, name: c.name }); set('company_id', c.id); set('policy_id', null); setQuery('') }}
                  className="w-full text-left bg-transparent border-0 px-3 py-1.5 text-[13.5px] text-trs-ink cursor-pointer hover:bg-trs-canvas">{c.name}</button></li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      <Field label="Policy">
        <select className={selectCls} value={form.policy_id ?? ''} onChange={e => set('policy_id', e.target.value || null)}>
          <option value="">No policy</option>
          {opts.policies.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Case type">
          <select className={selectCls} value={form.case_type ?? ''} onChange={e => set('case_type', e.target.value)}>
            {CASE_TYPES.map(t => <option key={t} value={t}>{CASE_TYPE[t] ?? t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? ''} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(t => <option key={t} value={t}>{STATUS[t]?.label ?? t}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <select className={selectCls} value={form.owner_email ?? ''} onChange={e => set('owner_email', e.target.value || null)}>
            <option value="">Unowned</option>
            {opts.staff.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Insurer"><input className={inputCls} value={form.insurer_name ?? ''} onChange={e => set('insurer_name', e.target.value)} /></Field>
        <Field label="Deadline"><input type="date" className={inputCls} value={form.deadline ?? ''} onChange={e => set('deadline', e.target.value || null)} /></Field>
        <Field label="Deadline basis"><input className={inputCls} placeholder="e.g. MOM 21-day rule" value={form.deadline_basis ?? ''} onChange={e => set('deadline_basis', e.target.value)} /></Field>
      </div>
      <Field label="Next action"><textarea className={textareaCls} rows={2} value={form.next_action ?? ''} onChange={e => set('next_action', e.target.value)} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Pending level" hint={form.pending_override ? 'Set by a person; the rule no longer applies' : `Rule: ${item.pending.reason}`}>
          <select className={selectCls} value={form.pending_override ?? ''} onChange={e => set('pending_override', (e.target.value || null) as PendingLevel | null)}>
            <option value="">By rule ({item.pending.level})</option>
            {(Object.keys(LEVEL_LABEL) as PendingLevel[]).map(l => <option key={l} value={l}>{l} · {LEVEL_LABEL[l]}</option>)}
          </select>
        </Field>
        {form.pending_override && <Field label="Reason"><input className={inputCls} value={form.pending_override_reason ?? ''} onChange={e => set('pending_override_reason', e.target.value)} /></Field>}
      </div>
      <div className="flex justify-end gap-2">
        <Btn level="primary" size="sm" type="submit" loading={busy}>Save case</Btn>
      </div>
    </form>
  )
}

/** The files on a draft, each removable, and a list of the client's data-room files to add. */
export function AttachmentPicker({ itemId, draftId, files, documents, onChanged, onError }: {
  itemId: string; draftId: string; files: string[]
  documents: ItemDetail['documents']; onChanged: () => void; onError: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function apply(keep: string[], add: string[]) {
    setBusy(true)
    try { await callApi(`/api/work/${itemId}/edit`, { method: 'POST', body: { attachments: { draft_id: draftId, keep, add } } }); setOpen(false); onChanged() }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  const have = new Set(files)
  const addable = documents.filter(d => d.drive_url && !have.has(d.title))
  return (
    <div className="flex flex-col gap-2 px-4 py-2.5 border-t border-trs-line">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-trs-muted">
        {files.length ? 'Attached' : 'No attachments'}
        {files.map(f => (
          <span key={f} className="inline-flex items-center gap-1 rounded-full border border-trs-line bg-trs-canvas pl-2 pr-1 h-[22px] text-[12px] text-trs-ink">
            <span className="max-w-[220px] truncate">{f}</span>
            <button type="button" aria-label={`Remove ${f}`} disabled={busy} onClick={() => void apply(files.filter(x => x !== f), [])} className="w-[16px] h-[16px] rounded-full border-0 bg-transparent text-trs-muted cursor-pointer hover:text-trs-neg leading-none">×</button>
          </span>
        ))}
        <Btn size="xs" level="tertiary" onClick={() => setOpen(v => !v)} disabled={busy}>{open ? 'Close' : 'Add from data room'}</Btn>
      </div>
      {open && (
        <ul className="m-0 p-0 list-none rounded-[7px] border border-trs-line bg-white max-h-[220px] overflow-auto">
          {addable.length === 0 && <li className="px-3 py-2 text-[12.5px] text-trs-muted">Nothing in the data room to add.</li>}
          {addable.map(d => (
            <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 border-b border-trs-line last:border-b-0">
              <span className="min-w-0"><span className="block text-[13px] text-trs-ink truncate">{d.title}</span><span className="block text-[11.5px] text-trs-muted">{d.doc_type.replace(/_/g, ' ')}</span></span>
              <Btn size="xs" disabled={busy} onClick={() => void apply(files, [d.id])}>Attach</Btn>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
