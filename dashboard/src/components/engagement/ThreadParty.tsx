'use client'

/**
 * Who the thread is from, labelled by a person: Client, Insurer or Referral
 * (`src/lib/crm/thread-party.ts`). The label sets the kind of the company the thread is filed
 * under. Client or Insurer: Read thread runs the model on the thread; on an insurer thread it
 * names the client the thread is about. Referral: the client is picked in the shared company
 * search, or added as a new company from what was typed.
 */
import { useEffect, useState } from 'react'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { callApi, errText } from '@/components/placement/shared'
import { PARTIES, PARTY_LABEL, partyOfKind, type Party } from '@/lib/crm/thread-party'
import { ERROR, INK, MUTED, SECOND } from './rail-bits'

export type PartyChange = { kind: string; clientCompanyId?: string | null; clientName?: string | null; clientNamed?: string | null }

export function ThreadParty({ threadId, companyName, kind, clientCompanyId, clientName, clientNamed, onChanged, onRead }: {
  threadId: string
  /** The company the thread is filed under: the one the label applies to. */
  companyName: string | null
  kind: string | null
  clientCompanyId: string | null
  clientName: string | null
  /** A client the model named that is not on file: filled in, so + Add takes one click. */
  clientNamed: string | null
  onChanged: (c: PartyChange) => void
  /** Read thread finished: the rail reloads the thread's read. */
  onRead: () => void
}) {
  const [party, setParty] = useState<Party | null>(partyOfKind(kind))
  const [client, setClient] = useState<CompanyPick>({ id: null, name: '' })
  const [busy, setBusy] = useState<'label' | 'read' | 'client' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [read, setRead] = useState<string | null>(null)

  useEffect(() => { setParty(partyOfKind(kind)); setClient({ id: null, name: '' }); setError(null); setRead(null) }, [threadId, kind])

  async function label(p: Party) {
    const was = party
    setParty(p); setBusy('label'); setError(null); setRead(null)
    try {
      await callApi(`/api/engagement/thread/${threadId}/party`, { method: 'PATCH', body: { party: p } })
      onChanged({ kind: p === 'referral' ? 'partner' : p })
    } catch (e) { setParty(was); setError(errText(e)) } finally { setBusy(null) }
  }

  async function pickClient(v: CompanyPick) {
    setClient(v)
    if (!v.id) return
    setBusy('client'); setError(null)
    try {
      const r = await callApi<{ clientCompanyId?: string }>(`/api/engagement/thread/${threadId}/party`, { method: 'PATCH', body: { party: 'referral', client: { companyId: v.id } } })
      onChanged({ kind: 'partner', clientCompanyId: r.clientCompanyId ?? v.id, clientName: v.name, clientNamed: null })
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  async function readThread() {
    setBusy('read'); setError(null); setRead(null)
    try {
      if (party === 'insurer') {
        const r = await callApi<{ clientCompanyId: string | null; named: string | null }>(`/api/engagement/thread/${threadId}/party`, { method: 'POST' })
        if (r.clientCompanyId) onChanged({ kind: 'insurer', clientCompanyId: r.clientCompanyId, clientNamed: null })
        else if (r.named) onChanged({ kind: 'insurer', clientCompanyId: null, clientNamed: r.named })
        setRead(r.clientCompanyId ? 'Client filed' : r.named ? `Names ${r.named}, not on file` : 'No client named')
      }
      await callApi(`/api/threads/${threadId}/bar`, { method: 'POST', body: { action: 'read' } })
      onRead()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={party ?? ''}
        disabled={busy !== null}
        onChange={e => void label(e.target.value as Party)}
        aria-label="Thread from"
        title={companyName ? `Applies to every thread from ${companyName}` : undefined}
        className="h-8 w-full max-w-[200px] rounded-[7px] border bg-white pl-2 pr-7 text-[13.5px] cursor-pointer outline-none focus:border-[#0f1412] disabled:opacity-50"
        style={{ borderColor: '#d5d9d4', color: INK }}
      >
        {!party && <option value="" disabled>Choose</option>}
        {PARTIES.map(p => <option key={p} value={p}>{PARTY_LABEL[p]}</option>)}
      </select>

      {(party === 'client' || party === 'insurer') && (
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className={SECOND} onClick={() => void readThread()} disabled={busy !== null}>{busy === 'read' ? 'Reading…' : 'Read thread'}</button>
          {read && <span className="text-[13px]" style={{ color: MUTED }}>{read}</span>}
        </div>
      )}

      {party === 'referral' && (
        <div className="text-[13.5px]">
          <CompanyField value={client.id || client.name ? client : clientCompanyId ? { id: clientCompanyId, name: clientName ?? '' } : { id: null, name: clientNamed ?? '' }} onChange={v => void pickClient(v)} allowCreate label="Company" listId={`referral-client-${threadId}`} />
          {busy === 'client' && <span className="text-[13px]" style={{ color: MUTED }}>Saving…</span>}
        </div>
      )}

      {error && <span className="text-[13px]" role="alert" style={{ color: ERROR }}>{error}</span>}
    </div>
  )
}
