'use client'

/**
 * A Remove or Discard asked in place: the button turns into the question with the action and
 * Cancel beside it. For one row of a list, where a modal would hide what is being removed.
 */
import { useState } from 'react'
import { Btn } from '@/components/crm/primitives'

export function InlineConfirm({ label, question, action, onConfirm, busy = false, disabled = false, danger = true, children }: {
  label: string; question: string; action: string; onConfirm: () => void | Promise<void>
  busy?: boolean; disabled?: boolean; danger?: boolean; children?: React.ReactNode
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) return <Btn size="xs" level="tertiary" onClick={() => setAsking(true)} disabled={disabled || busy}>{label}</Btn>
  return (
    <span role="group" aria-label={question} className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-small text-trs-muted">{question}</span>
      {children}
      <Btn size="xs" level={danger ? 'danger' : 'secondary'} loading={busy} disabled={disabled} onClick={async () => { await onConfirm(); setAsking(false) }}>{action}</Btn>
      <Btn size="xs" level="tertiary" onClick={() => setAsking(false)} disabled={busy}>Cancel</Btn>
    </span>
  )
}
