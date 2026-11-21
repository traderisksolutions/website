'use client'

/**
 * Who the thread is from, labelled by a person: Client, Insurer or Referral, as one row of pills
 * (`src/lib/crm/thread-party.ts`). The label sets the kind of the company the thread is filed
 * under. Referral: the client is picked in the shared company search, or added as a new company
 * from what was typed. Read thread sits in the rail's AI group (ChiefBar); on an insurer thread
 * it first names the client the thread is about (`readInsurerClient` below).
 */
import { useEffect, useState } from 'react'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { callApi, errText } from '@/components/placement/shared'
import { PARTIES, PARTY_LABEL, partyOfKind, type Party } from '@/lib/crm/thread-party'
import { Segmented } from '@/components/crm/primitives'
import { callInbox } from '@/lib/inbox/fetch'

export type PartyChange = { kind: string; clientCompanyId?: string | null; clientName?: string | null; clientNamed?: string | null }

/** Read thread on an insurer thread, before the read itself: the client the thread is about.
 *  Returns the line shown under the row. */
export async function readInsurerClient(threadId: string, onChanged: (c: PartyChange) => void): Promise<string> {
  const r = await callInbox<{ clientCompanyId: string | null; named: string | null }>(`/api/engagement/thread/${threadId}/party`, { method: 'POST' })
  if (r.clientCompanyId) onChanged({ kind: 'insurer', clientCompanyId: r.clientCompanyId, clientNamed: null })
  else if (r.named) onChanged({ kind: 'insurer', clientCompanyId: null, clientNamed: r.named })
  return r.clientCompanyId ? 'Client filed' : r.named ? `Names ${r.named}, not on file` : 'No client named'
}

export function ThreadParty({ threadId, companyName, kind, clientCompanyId, clientName, clientNamed, onChanged }: {
  threadId: string
  /** The company the thread is filed under: the one the label applies to. */
  companyName: string | null
  kind: string | null
  clientCompanyId: string | null
  clientName: string | null
  /** A client the model named that is not on file: filled in, so + Add takes one click. */
  clientNamed: string | null
  onChanged: (c: PartyChange) => void
}) {
  const [party, setParty] = useState<Party | null>(partyOfKind(kind))
  const [client, setClient] = useState<CompanyPick>({ id: null, name: '' })
  const [busy, setBusy] = useState<'label' | 'client' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setParty(partyOfKind(kind)); setClient({ id: null, name: '' }); setError(null) }, [threadId, kind])

  async function label(p: Party) {
    const was = party
    setParty(p); setBusy('label'); setError(null)
    try {
      await callInbox(`/api/engagement/thread/${threadId}/party`, { method: 'PATCH', body: { party: p } })
      onChanged({ kind: p === 'referral' ? 'partner' : p })
    } catch (e) { setParty(was); setError(errText(e)) } finally { setBusy(null) }
  }

  async function pickClient(v: CompanyPick) {
    setClient(v)
    if (!v.id) return
    setBusy('client'); setError(null)
    try {
      const r = await callInbox<{ clientCompanyId?: string }>(`/api/engagement/thread/${threadId}/party`, { method: 'PATCH', body: { party: 'referral', client: { companyId: v.id } } })
      onChanged({ kind: 'partner', clientCompanyId: r.clientCompanyId ?? v.id, clientName: v.name, clientNamed: null })
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-2">
      <div title={companyName ? `Applies to every thread from ${companyName}` : undefined} className={busy !== null ? 'opacity-60 pointer-events-none' : undefined}>
        <Segmented<Party | ''>
          value={party ?? ''}
          onChange={p => { if (p && p !== party && busy === null) void label(p) }}
          label="Thread from"
          options={PARTIES.map(p => ({ value: p, label: PARTY_LABEL[p] }))}
          className="flex-nowrap"
        />
      </div>

      {party === 'referral' && (
        <div className="text-body">
          <CompanyField value={client.id || client.name ? client : clientCompanyId ? { id: clientCompanyId, name: clientName ?? '' } : { id: null, name: clientNamed ?? '' }} onChange={v => void pickClient(v)} allowCreate label="Company" listId={`referral-client-${threadId}`} />
          {busy === 'client' && <span className="text-body text-trs-muted">Saving…</span>}
        </div>
      )}

      {error && <span className="text-body text-trs-neg" role="alert">{error}</span>}
    </div>
  )
}
