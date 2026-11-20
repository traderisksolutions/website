'use client'

/**
 * "Case from threads": the threads a person ticked on Today › Mail become one case. The form opens
 * with what the threads themselves say (GET /api/work/combine): the client, the kind of case, a
 * title and each thread's side. The person names the client and marks every thread as the
 * client's or as an insurer on file, then starts the case or adds the threads to an open one.
 * A thread another case holds moves only when the button says so. No model is called.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Field, Spinner } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { SelectBox } from '@/components/ui/select-box'
import { Register } from '@/components/ui/register'
import { callApi, errText } from '@/components/placement/shared'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { CASE_TYPE } from '@/components/assistant/shared'
import { SideSelect, type From } from '@/components/cases/SideSelect'
import { count, selectCls } from '@/components/cases/shared'
import { DASH, fmtDate } from '@/lib/format'
import type { CombinePreview } from '@/lib/cases/combine'

const NEW = 'new'
const fieldSelect = `${selectCls} h-9 w-full`

export function CombineDialog({ threadIds, onClose, presetCompany = null, presetCase = null }: {
  /** The ticked threads; null keeps the dialog shut. */
  threadIds: string[] | null
  onClose: () => void
  /** The client the form opens on, over the one the threads name (Renewal Season). */
  presetCompany?: string | null
  /** The open case the form opens on, when it is one of the client's. */
  presetCase?: string | null
}) {
  const router = useRouter()
  const [view, setView] = useState<CombinePreview | null>(null)
  const [company, setCompany] = useState<CompanyPick>({ id: null, name: '' })
  const [target, setTarget] = useState(NEW)
  const [caseType, setCaseType] = useState('other')
  const [title, setTitle] = useState('')
  // The sides a person set stand when the client changes; the rest follow the new client.
  const [sides, setSides] = useState<Record<string, From>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asked = useRef(0)
  const key = threadIds?.join(',') ?? null

  const load = useCallback(async (companyId: string | null, first: boolean) => {
    if (!key) return
    const n = ++asked.current
    try {
      const next = await callApi<CombinePreview>(`/api/work/combine?threads=${key}${companyId ? `&company=${companyId}` : ''}`)
      if (n !== asked.current) return
      setView(next)
      setTarget(t => (first && presetCase && next.cases.some(c => c.id === presetCase) ? presetCase : next.cases.some(c => c.id === t) ? t : NEW))
      if (first) { setCompany(next.client ? { id: next.client.id, name: next.client.name } : { id: null, name: '' }); setCaseType(next.case_type); setTitle(next.title); setError(null) }
    } catch (e) {
      if (n === asked.current) setError(errText(e))
    }
  }, [key, presetCase])
  useEffect(() => {
    setView(null); setSides({}); setTarget(NEW); setError(null); setBusy(false)
    void load(presetCompany, true)
  }, [load, presetCompany])

  function pickCompany(next: CompanyPick) {
    setCompany(next)
    if (next.id && next.id !== view?.client?.id) void load(next.id, false)
  }

  const threads = view?.threads ?? []
  const fromOf = (t: CombinePreview['threads'][number]): From => sides[t.id] ?? { side: t.side, insurer: t.insurer_id }
  const moving = threads.filter(t => t.held && t.held.id !== (target === NEW ? null : target))
  const ready = !!view && (target !== NEW || (!!company.id && title.trim().length > 0))

  async function combine() {
    if (!view || !ready) return
    setBusy(true); setError(null)
    try {
      const sent = threads.map(t => { const f = fromOf(t); return { id: t.id, side: f.side, insurer_id: f.insurer } })
      const d = await callApi<{ id: string }>('/api/work/combine', { method: 'POST', body: {
        ...(target === NEW ? { company_id: company.id, case_type: caseType, title: title.trim() } : { work_item_id: target }),
        threads: sent, move: moving.map(t => t.id),
      } })
      router.push(`/today/${d.id}?section=rounds`)
    } catch (e) {
      setError(errText(e))
      // A thread may have joined another case since the form opened: the table is read again.
      await load(company.id, false)
      setBusy(false)
    }
  }

  const action = target === NEW ? 'Start case' : 'Add to case'
  return (
    <Dialog open={threadIds !== null} onOpenChange={o => { if (!o && !busy) onClose() }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[860px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Case from {count(threadIds?.length ?? 0, 'thread')}</DialogTitle>
          <DialogDescription className="sr-only">The ticked threads become one case. Each thread is marked as the client’s or as an insurer’s.</DialogDescription>
        </DialogHeader>
        {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
        {!view ? (error ? null : <Spinner label="Reading the threads…" />) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <CompanyField value={company} onChange={pickCompany} allowCreate label="Client" listId="combine-client-options" />
              <Field label="Case">
                <select className={fieldSelect} value={target} disabled={busy} onChange={e => setTarget(e.target.value)}>
                  <option value={NEW}>New case</option>
                  {view.cases.length > 0 && (
                    <optgroup label="Open cases">
                      {view.cases.map(c => <option key={c.id} value={c.id}>{[CASE_TYPE[c.case_type] ?? 'Other', c.title ?? 'Open case'].join(' · ')}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              {target === NEW && (
                <>
                  <Field label="Kind">
                    <SelectBox label="Kind" size="md" className="h-9" value={caseType} disabled={busy} onChange={setCaseType}
                      options={Object.entries(CASE_TYPE).map(([value, name]) => ({ value, label: name }))} />
                  </Field>
                  <Field label="Title">
                    <Input value={title} maxLength={140} disabled={busy} onChange={e => setTitle(e.target.value)} />
                  </Field>
                </>
              )}
            </div>
            <Register label="Threads" minWidth={720}>
                <thead><tr><th>Thread</th><th>Side</th><th>Filed under</th><th>Last message</th><th>On case</th></tr></thead>
                <tbody>
                  {threads.map(t => (
                    <tr key={t.id}>
                      <td className="cell-left max-w-[260px]"><span className="block truncate" title={t.subject ?? undefined}>{t.subject || 'No subject'}</span></td>
                      <td><SideSelect subject={t.subject} value={fromOf(t)} insurers={view.insurers} disabled={busy} onChange={f => setSides(v => ({ ...v, [t.id]: f }))} /></td>
                      <td className="cell-left max-w-[180px]">{t.company ? <span className="block truncate" title={t.company.name ?? undefined}>{t.company.name ?? 'Company'}</span> : <span className="text-trs-muted">Unfiled</span>}</td>
                      <td className="whitespace-nowrap tabular-nums">{fmtDate(t.last_message_at)}</td>
                      <td className="cell-left max-w-[180px]">{t.held ? <span className="block truncate" title={t.held.title ?? undefined}>{t.held.title ?? 'Open case'}</span> : <span className="text-trs-muted">{DASH}</span>}</td>
                    </tr>
                  ))}
                </tbody>
            </Register>
          </>
        )}
        <DialogFooter className="gap-2 sm:space-x-0">
          <Btn disabled={busy} onClick={onClose}>Cancel</Btn>
          <Btn level="primary" disabled={busy || !ready} loading={busy} onClick={() => void combine()}>{moving.length ? `${action} · move ${count(moving.length, 'thread')}` : action}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
