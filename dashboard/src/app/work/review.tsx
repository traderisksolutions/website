'use client'

/**
 * Review: the decisions agents must not make (agent_tasks with status needs_human). Each row is
 * the question in one line; a person approves, answers with a note, or closes it. Approving or
 * answering sends the task back to its agent with the answer; closing ends it. Nothing sends mail.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { Btn, Spinner, Empty, textareaCls } from '@/components/crm/primitives'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { fmtDateTime } from '@/lib/crm/format'
import type { AgentTask } from '@/lib/agent-tasks/queue'

const AGENT: Record<string, string> = {
  intake: 'Intake', resolver: 'Resolver', document_clerk: 'Document clerk', policy_reader: 'Policy reader', knowledge_keeper: 'Knowledge keeper',
  claims: 'Claims', endorsements: 'Endorsements', endorsement_main: 'Endorsement main', eb_movements: 'EB movements', renewals: 'Renewals', placement: 'Placement', billing: 'Billing',
  recipient_router: 'Recipient router', drafter: 'Drafter', chaser: 'Chaser',
}

export type ReviewState = { tasks: AgentTask[] | null; missing: boolean; error: string | null }

export function useReview() {
  const [state, setState] = useState<ReviewState>({ tasks: null, missing: false, error: null })
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-tasks?status=needs_human', { cache: 'no-store' })
      if (res.status === 404) { setState({ tasks: [], missing: true, error: null }); return }
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setState({ tasks: [], missing: false, error: typeof d?.error === 'string' ? d.error : `Request failed (${res.status}).` }); return }
      setState({ tasks: Array.isArray(d?.tasks) ? d.tasks : [], missing: false, error: null })
    } catch (e) {
      setState({ tasks: [], missing: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [])
  useEffect(() => { void load() }, [load])
  return { ...state, reload: load }
}

export function ReviewList({ state, reload }: { state: ReviewState; reload: () => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!state.tasks) return <Spinner label="Loading review…" />
  if (state.missing) return <Empty>Review is not switched on yet.</Empty>
  return (
    <div className="flex flex-col gap-3">
      {(state.error || error) && <p className="m-0 text-[13.5px] text-trs-neg">{error ?? state.error}</p>}
      {notice && <p className="m-0 text-[13.5px] text-trs-ink">{notice}</p>}
      {state.tasks.length === 0 ? <Empty>No decisions waiting.</Empty> : (
        <ul className="m-0 p-0 list-none flex flex-col border-t border-trs-line">
          {state.tasks.map(t => <ReviewRow key={t.id} task={t} onDone={m => { setNotice(m); setError(null); reload() }} onError={setError} />)}
        </ul>
      )}
    </div>
  )
}

function ReviewRow({ task: t, onDone, onError }: { task: AgentTask; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const question = typeof t.result?.question === 'string' ? t.result.question : `${AGENT[t.agent] ?? t.agent}: ${t.kind}`
  const client = typeof t.payload?.company_name === 'string' ? t.payload.company_name : null

  async function resolve(answer: Record<string, unknown>, requeue: boolean, done: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/agent-tasks/${t.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer, requeue }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof d?.error === 'string' ? d.error : `Request failed (${res.status}).`)
      onDone(done)
    } catch (e) { onError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <li className="flex flex-col gap-2 py-3 border-b border-trs-line">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-trs-muted truncate">
            {AGENT[t.agent] ?? t.agent}{client ? ` · ${client}` : ''} · {fmtDateTime(t.finished_at ?? t.created_at)}
          </div>
          <div className="text-[14.5px] font-medium leading-snug text-trs-ink">{question}</div>
          {t.thread_id && <Link href={`/engagement?thread=${t.thread_id}`} className="text-[13px] text-trs-muted no-underline hover:underline">Open thread</Link>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Btn size="xs" disabled={busy} onClick={() => void resolve({ decision: 'approve' }, true, 'Approved. Sent back to the agent.')}>Approve</Btn>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More actions" disabled={busy} className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[7px] border-0 bg-transparent cursor-pointer text-trs-muted hover:bg-trs-canvas hover:text-trs-ink">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setNoting(true)}>Answer with a note</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void resolve({ decision: 'close' }, false, 'Closed without action.')}>Close without action</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {noting && (
        <div className="flex flex-col gap-2">
          <textarea className={textareaCls} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Answer for the agent" aria-label="Answer for the agent" />
          <div className="flex items-center gap-2">
            <Btn size="xs" level="tertiary" disabled={busy} onClick={() => { setNoting(false); setNote('') }} className="mr-auto">Cancel</Btn>
            <Btn size="xs" level="primary" disabled={busy || !note.trim()} loading={busy} onClick={() => void resolve({ decision: 'answer', note: note.trim() }, true, 'Answer sent back to the agent.')}>Send answer</Btn>
          </div>
        </div>
      )}
    </li>
  )
}
