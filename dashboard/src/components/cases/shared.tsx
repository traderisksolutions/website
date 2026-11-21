'use client'

/**
 * Shared by the case page's sections (Sources, Conversation, Rounds, Brief, Comparison, Resume point): the section
 * list, the table frame, and the one button that starts the case reader on the case's threads.
 */
import { useState } from 'react'
import { Btn, type BtnLevel } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { callWork } from '@/lib/work/fetch'

export const CASE_SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sources', label: 'Sources' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'rounds', label: 'Rounds' },
  { value: 'brief', label: 'Brief' },
  { value: 'comparison', label: 'Comparison' },
] as const
export type CaseSection = typeof CASE_SECTIONS[number]['value']
export const asCaseSection = (v: string | null): CaseSection => CASE_SECTIONS.find(s => s.value === v)?.value ?? 'overview'

export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const tableFrame = 'relative overflow-x-auto bg-white'
export const selectCls = 'h-8 max-w-full rounded border border-trs-line-2 bg-white px-2 text-body text-trs-ink outline-none focus:border-trs-ink'
export const headingCls = 'm-0 text-heading font-semibold leading-tight text-trs-ink'
/** A subject in a table cell that opens the thread over the page. */
export const subjectBtn = 'block max-w-full truncate bg-transparent border-0 p-0 cursor-pointer text-left text-body text-trs-ink hover:underline'

/** "Read 2 new emails": a person starts the case reader on the threads on this case. */
export function ReadNewButton({ id, unread, level = 'secondary', onDone, onError }: {
  id: string
  /** Emails on the case the case reader has not read. */
  unread: number
  level?: BtnLevel
  onDone: (notice: string) => void
  onError: (message: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  async function read() {
    setBusy(true); onError(null)
    try {
      const d = await callWork<{ notes: number; read: number }>(`/api/work/${id}/read`, { method: 'POST', body: {} })
      onDone(`${count(d.notes, 'note')} kept, ${count(d.read, 'email')} read.`)
    } catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  return <Btn level={level} disabled={busy || unread === 0} loading={busy} onClick={() => void read()}>{unread === 0 ? 'No new emails' : `Read ${count(unread, 'new email')}`}</Btn>
}
