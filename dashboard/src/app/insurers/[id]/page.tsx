'use client'

/**
 * One insurer's email threads: every conversation it takes part in, the client, and the policy it
 * is about — suggested by rule or by the agent, confirmed by a broker in one click.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Btn, Chip, Segmented, Spinner } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterEmpty, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { callApi, errText, ERROR, INK, MUTED } from '@/components/placement/shared'

type Row = {
  id: string; thread_id: string; subject: string; via: string; policy_id: string | null
  policy_status: 'none' | 'suggested' | 'confirmed' | 'not_a_policy'; policy_how: string | null; reason: string | null; confidence: number | null
  last_message_at: string | null; client: { id: string; name: string } | null; options: { id: string; label: string; same_insurer: boolean }[]
}
type Data = { insurer: { id: string; company_name: string; domain: string | null }; rows: Row[] }
type View = 'tag' | 'done' | 'no_client'

const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'
const HOW: Record<string, string> = {
  'policy no. in subject': 'Policy no. in subject', 'only policy with this insurer': 'Only policy with this insurer',
  'cover named in subject': 'Cover named in subject', agent: 'Agent', broker: 'Broker',
}
const selCls = 'h-[30px] rounded-[6px] border border-[#d5d9d4] bg-white px-2 text-[13px] outline-none focus:border-[#132c1c] max-w-[340px]'

export default function InsurerThreadsPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('tag')
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setData(await callApi<Data>(`/api/insurers/${id}/threads`)); setError(null) } catch (e) { setError(errText(e)) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const rows = data?.rows ?? []
    return {
      tag: rows.filter(r => r.client && (r.policy_status === 'suggested' || r.policy_status === 'none')),
      done: rows.filter(r => r.policy_status === 'confirmed' || r.policy_status === 'not_a_policy'),
      no_client: rows.filter(r => !r.client),
    }
  }, [data])

  async function save(r: Row, body: Record<string, unknown>) {
    setBusy(r.id)
    try { await callApi(`/api/thread-insurers/${r.id}`, { method: 'PATCH', body }); await load() }
    catch (e) { setError(errText(e)) }
    finally { setBusy(null) }
  }

  if (error && !data) return <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12"><p style={{ color: ERROR }}>{error}</p></div>
  if (!data) return <Spinner label="Loading threads" />
  const rows = groups[view]

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <Link href="/insurers" className="text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Insurers</Link>
        <h1 className="m-0 mt-3 text-[30px] leading-[1.15]">{data.insurer.company_name}</h1>
        <div className="mt-2 text-[14px]" style={{ color: MUTED }}>{data.rows.length} threads{data.insurer.domain ? ` · ${data.insurer.domain}` : ''}</div>
        <div className="mt-6 mb-4">
          <Segmented<View> value={view} onChange={setView} options={[
            { value: 'tag', label: 'To tag', count: groups.tag.length },
            { value: 'done', label: 'Tagged', count: groups.done.length },
            { value: 'no_client', label: 'No client', count: groups.no_client.length },
          ]} />
        </div>
        {error && <p className="m-0 mb-3 text-[13.5px]" style={{ color: ERROR }}>{error}</p>}
        <Register label={`${data.insurer.company_name} threads`} minWidth={1080}>
          <RegisterHead>
            <RegisterTh first width={110}>Last message</RegisterTh>
            <RegisterTh>Thread</RegisterTh>
            <RegisterTh width={200}>Client</RegisterTh>
            <RegisterTh width={340}>Policy</RegisterTh>
            <RegisterTh width={170}>Tagged by</RegisterTh>
            <RegisterTh last align="right" width={150}> </RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.length === 0 && <RegisterEmpty colSpan={6}>{view === 'tag' ? 'Every thread is tagged.' : view === 'done' ? 'Nothing tagged yet.' : 'Every thread has a client.'}</RegisterEmpty>}
            {rows.map(r => {
              const chosen = pick[r.id] ?? r.policy_id ?? ''
              const done = r.policy_status === 'confirmed' || r.policy_status === 'not_a_policy'
              return (
                <RegisterRow key={r.id}>
                  <RegisterCell first primary={fmt(r.last_message_at)} />
                  <RegisterCell title={r.subject}>
                    <Link href={`/engagement?lead=${r.thread_id}`} className="no-underline hover:underline" style={{ color: INK }}>{r.subject}</Link>
                  </RegisterCell>
                  <RegisterCell>{r.client ? <Link href={`/companies/${r.client.id}?tab=documents`} className="no-underline hover:underline" style={{ color: INK }}>{r.client.name}</Link> : <span style={{ color: MUTED }}>No client</span>}</RegisterCell>
                  <RegisterCell>
                    {r.policy_status === 'not_a_policy' ? <span style={{ color: MUTED }}>Not about a policy</span>
                      : r.options.length === 0 ? <span style={{ color: MUTED }}>{r.client ? 'Client has no policies' : '–'}</span>
                      : (
                        <select className={selCls} value={chosen} disabled={busy === r.id} aria-label="Policy" onChange={e => setPick(p => ({ ...p, [r.id]: e.target.value }))}>
                          <option value="">Choose the policy…</option>
                          {r.options.map(o => <option key={o.id} value={o.id}>{o.label}{o.same_insurer ? '' : ' (other insurer)'}</option>)}
                        </select>
                      )}
                  </RegisterCell>
                  <RegisterCell title={r.reason ?? undefined}>
                    {done ? <Chip tone="green">{r.policy_status === 'confirmed' ? 'Confirmed' : 'Marked'}</Chip>
                      : r.policy_id ? <Chip tone="blue">{HOW[r.policy_how ?? ''] ?? 'Suggested'}</Chip>
                      : <Chip>Not tagged</Chip>}
                  </RegisterCell>
                  <RegisterCell last align="right">
                    {!done && r.client && (
                      <span className="inline-flex gap-1.5">
                        <Btn size="xs" level="tertiary" disabled={busy === r.id} onClick={() => void save(r, { not_a_policy: true })}>No policy</Btn>
                        <Btn size="xs" level={chosen ? 'primary' : 'secondary'} disabled={busy === r.id || !chosen} onClick={() => void save(r, { policy_id: chosen })}>Confirm</Btn>
                      </span>
                    )}
                  </RegisterCell>
                </RegisterRow>
              )
            })}
          </tbody>
        </Register>
      </div>
    </div>
  )
}
