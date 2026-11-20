'use client'

/**
 * A thread that came through a referral, marked by a person (`src/lib/crm/thread-referral.ts`).
 * The row shows when the rules read a referral in the thread's senders (the address, the
 * signature or the wording) or a person has marked it. The mark is on this thread alone: the
 * company it is filed under keeps its kind (From sets that, for every thread from the company).
 */
import { useEffect, useState } from 'react'
import { callApi, errText } from '@/components/placement/shared'
import type { ThreadReferral as Referral } from '@/lib/crm/thread-referral'
import { ERROR, InfoRow, MUTED, SECOND } from './rail-bits'
import { firstPaintKey, takeFirstPaint } from './first-paint'

const READ_BY = { address: 'Address', signature: 'Signature', voice: 'Wording' } as const

export function ThreadReferral({ threadId, kind }: {
  threadId: string
  /** The kind of the company the thread is filed under: a change there changes what the rules read. */
  kind: string | null
}) {
  const [state, setState] = useState<Referral | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setState(null); setError(null)
    // A thread with no reading shows no row, so a failed read stays quiet.
    const kept = takeFirstPaint<Referral>(firstPaintKey.referral(threadId))
    if (kept) setState(kept)
    else callApi<Referral>(`/api/engagement/thread/${threadId}/referral`).then(r => { if (live) setState(r) }).catch(() => {})
    return () => { live = false }
  }, [threadId, kind])

  async function mark(referral: boolean | null) {
    setBusy(true); setError(null)
    try {
      setState(await callApi<Referral>(`/api/engagement/thread/${threadId}/referral`, { method: 'POST', body: { referral } }))
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const { tag, suggestion } = state ?? { tag: null, suggestion: null }
  if (!tag && !suggestion) return null

  return (
    <InfoRow label="Referral">
      <div className="flex flex-col gap-2">
        {tag ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span>{tag.referral ? tag.company ?? 'Referral' : 'Not a referral'}</span>
            <button type="button" className={SECOND} onClick={() => void mark(null)} disabled={busy}>{tag.referral ? 'Remove' : 'Undo'}</button>
          </div>
        ) : suggestion && (
          <>
            <span>{suggestion.company ?? 'Referral'}</span>
            <span className="text-body [overflow-wrap:anywhere]" style={{ color: MUTED }}>{READ_BY[suggestion.by]}: {suggestion.cue}</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" className={SECOND} onClick={() => void mark(true)} disabled={busy}>Tag as referral</button>
              <button type="button" className={SECOND} onClick={() => void mark(false)} disabled={busy}>Not a referral</button>
            </div>
          </>
        )}
        {error && <span className="text-body" role="alert" style={{ color: ERROR }}>{error}</span>}
      </div>
    </InfoRow>
  )
}
