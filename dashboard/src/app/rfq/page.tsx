'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Btn, Spinner } from '@/components/crm/primitives'
import { XlGrid, XlHead, XlHeadRow, XlTh, XlRow, XlCell, XlNum, XlEmpty, XL_BTN, type XlFill } from '@/components/ui/xl-grid'
import { fmtDate, fmtRelative } from '@/lib/crm/format'
import { threadHref } from '@/lib/placement/position'
import { STAGE_WORD, type RegisterRowData, type RegisterStage, type WaitingOn } from '@/lib/placement/grid'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'

type Counts = { open: number; broker: number; insurer: number; client: number; unmatched: number; done_this_month: number }
type Candidate = { dispatch_id: string; insurer_name: string; to_email: string; ref: string | null; company_name: string | null; line_label: string | null }
type Unmatched = {
  id: string; message_id: string; thread_id: string | null; from_address: string | null; forwarded_by: string | null
  subject: string | null; reason: string; created_at: string; candidates: Candidate[]
}
type Filter = 'all' | 'broker' | 'insurer' | 'client' | 'unmatched'

const STAGE_FILL: Partial<Record<RegisterStage, XlFill>> = { chase: 'warn', drafted: 'info', not_asked: 'info', all_in: 'good', bound: 'good', shared: 'quiet', client_chose: 'pick', confirming: 'quiet', dn_due: 'good' }
const WAIT_WORD: Record<Exclude<WaitingOn, null>, string> = { broker: 'Us', insurer: 'Insurers', client: 'Client' }
const sgd = (n: number) => n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const who = (email: string | null) => email ? (email === 'agent' ? 'agent' : email.split('@')[0] + '@') : ''
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
/** Stages a broker acts on first sort to the top; within a stage, the oldest request first. */
const STAGE_ORDER: RegisterStage[] = ['chase', 'client_chose', 'dn_due', 'drafted', 'not_asked', 'all_in', 'bound', 'quoting', 'waiting', 'confirming', 'shared', 'done', 'dropped', 'lost']

/**
 * Requests for quotes: every line still in play across every client, one spreadsheet row each,
 * with what it waits on. A row opens the client's requests. Replies the agent could not tie to a
 * request wait underneath for a broker to place.
 */
export default function RfqRegisterPage() {
  const router = useRouter()
  const [rows, setRows] = useState<RegisterRowData[] | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [unmatched, setUnmatched] = useState<Unmatched[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [r, u] = await Promise.all([
        callApi<{ rows: RegisterRowData[]; counts: Counts }>('/api/placements/register'),
        callApi<{ replies: Unmatched[] }>('/api/placements/unmatched'),
      ])
      setRows(r.rows); setCounts(r.counts); setUnmatched(u.replies)
    } catch (e) { setError(errText(e)); setRows(rows => rows ?? []); setUnmatched(u => u ?? []) }
  }, [])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? [])
      .filter(r => filter === 'all' || filter === 'unmatched' || r.waiting_on === filter)
      .filter(r => !needle || [r.ref, r.company_name, r.line_label, ...r.options, r.next_step ?? '', r.last_by ?? ''].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.received.localeCompare(b.received) || a.ref.localeCompare(b.ref))
  }, [rows, filter, q])

  const chips: { key: Filter; label: string; n: number | undefined }[] = [
    { key: 'all', label: 'Open lines', n: counts?.open },
    { key: 'broker', label: 'Our move', n: counts?.broker },
    { key: 'insurer', label: 'Waiting on insurers', n: counts?.insurer },
    { key: 'client', label: 'Waiting on client', n: counts?.client },
    { key: 'unmatched', label: 'Replies to place', n: unmatched?.length ?? counts?.unmatched },
  ]

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1500px] px-6 sm:px-12 pt-12 pb-20">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Requests for quotes</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              Every policy a client asked us to quote and where it stands.
              {counts && counts.done_this_month > 0 && ` ${counts.done_this_month} done this month.`}
            </p>
          </div>
          <label className="relative flex items-center">
            <Search size={14} className="absolute left-2.5" style={{ color: MUTED }} aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ref, company, line" aria-label="Search requests"
              className="h-8 w-[260px] rounded-[8px] border border-[#dadce0] bg-white pl-8 pr-7 text-[13px] outline-none focus:border-[#202124]" />
            {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="absolute right-1.5 bg-transparent border-0 p-1 cursor-pointer" style={{ color: MUTED }}><X size={13} /></button>}
          </label>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-6 mb-3" role="tablist">
          {chips.map(c => (
            <button key={c.key} type="button" role="tab" aria-selected={filter === c.key} onClick={() => setFilter(c.key)}
              className="h-7 px-2.5 rounded-[7px] border cursor-pointer text-[13px] whitespace-nowrap"
              style={{ borderColor: filter === c.key ? INK : '#dadce0', background: filter === c.key ? '#f1f3f4' : '#fff', color: filter === c.key ? INK : '#3c4043', fontWeight: filter === c.key ? 500 : 400 }}>
              {c.label}{c.n !== undefined && <span className="ml-1.5 tabular-nums" style={{ color: MUTED }}>{c.n}</span>}
            </button>
          ))}
        </div>
        {error && <p className="m-0 mb-3 text-[13px]" style={{ color: ERROR }}>{error}</p>}

        {filter === 'unmatched'
          ? <UnmatchedReplies replies={unmatched} onChanged={load} />
          : !rows ? <Spinner label="Loading requests…" /> : (
            <XlGrid label="Requests for quotes" minWidth={1320} maxHeight="calc(100vh - 290px)">
              <XlHead>
                <XlHeadRow>
                  <XlTh width={32} />
                  <XlTh>Received</XlTh>
                  <XlTh>Ref</XlTh>
                  <XlTh align="left">Company</XlTh>
                  <XlTh>Line</XlTh>
                  <XlTh>Options</XlTh>
                  <XlTh title="Round">Rd</XlTh>
                  <XlTh>Asked</XlTh>
                  <XlTh>Quoted</XlTh>
                  <XlTh title="Lowest current premium, S$">Lowest</XlTh>
                  <XlTh>Inception</XlTh>
                  <XlTh>Status</XlTh>
                  <XlTh title="Who the line waits on">Waiting on</XlTh>
                  <XlTh>Next step</XlTh>
                  <XlTh title="The broker who last sent a request on it">Last by</XlTh>
                </XlHeadRow>
              </XlHead>
              <tbody>
                {shown.length === 0 && <XlEmpty colSpan={15}>{rows.length === 0 ? 'No open requests.' : 'Nothing matches.'}</XlEmpty>}
                {shown.map((r, i) => {
                  const soon = r.inception && Date.parse(r.inception) - Date.now() < 14 * 86_400_000
                  return (
                    <XlRow key={r.line_id} onClick={() => router.push(`/companies/${r.company_id}`)}>
                      <XlNum n={i + 1} />
                      <XlCell>{fmtDate(r.received)}</XlCell>
                      <XlCell strong>{r.ref}</XlCell>
                      <XlCell align="left" title={r.company_name}>{clip(r.company_name, 34)}</XlCell>
                      <XlCell title={r.line_label}>{clip(r.line_label, 26)}</XlCell>
                      <XlCell title={r.options.join(' · ')}>{r.options.length ? clip(r.options.join(' · '), 22) : ''}</XlCell>
                      <XlCell>{r.round || ''}</XlCell>
                      <XlCell>{r.asked}</XlCell>
                      <XlCell>{r.quoted}{r.declined ? <span style={{ color: MUTED }}> ·{r.declined}✕</span> : null}</XlCell>
                      <XlCell title={r.lowest ? `${r.lowest.insurer_name}${r.lowest.tier_label ? ` · ${r.lowest.tier_label}` : ''}` : undefined}>
                        {r.lowest?.premium_amount != null ? sgd(r.lowest.premium_amount) : ''}
                      </XlCell>
                      <XlCell fill={soon ? 'warn' : null} title={r.inception ? fmtRelative(r.inception) : undefined}>{r.inception ? fmtDate(r.inception) : ''}</XlCell>
                      <XlCell fill={STAGE_FILL[r.stage] ?? null}>{STAGE_WORD[r.stage]}</XlCell>
                      <XlCell>{r.waiting_on ? WAIT_WORD[r.waiting_on] : ''}</XlCell>
                      <XlCell align="left" muted title={r.next_step ?? undefined} width={240}><span className="block truncate">{r.next_step ?? ''}</span></XlCell>
                      <XlCell muted title={r.last_by ?? undefined}>{who(r.last_by)}</XlCell>
                    </XlRow>
                  )
                })}
              </tbody>
            </XlGrid>
          )}
      </div>
    </div>
  )
}

/**
 * Replies the agent thinks answer a request but could not tie to one. Tick the request(s) it
 * answers and Place it: the agent reads it as if it had arrived on that request's thread.
 */
function UnmatchedReplies({ replies, onChanged }: { replies: Unmatched[] | null; onChanged: () => void }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function resolve(r: Unmatched, ignore: boolean) {
    setBusy(r.id); setErrors(e => ({ ...e, [r.id]: '' }))
    try {
      await callApi(`/api/placements/unmatched/${r.id}`, { method: 'POST', body: ignore ? { ignore: true } : { dispatch_ids: picked[r.id] ?? [] } })
      onChanged()
    } catch (e) { setErrors(x => ({ ...x, [r.id]: errText(e) })) } finally { setBusy(null) }
  }
  const toggle = (rid: string, did: string) => setPicked(p => {
    const cur = p[rid] ?? []
    return { ...p, [rid]: cur.includes(did) ? cur.filter(x => x !== did) : [...cur, did] }
  })

  if (!replies) return <Spinner label="Loading replies…" />
  return (
    <XlGrid label="Replies to place" minWidth={1100}>
      <XlHead>
        <XlHeadRow>
          <XlTh width={32} />
          <XlTh>Received</XlTh>
          <XlTh>From</XlTh>
          <XlTh align="left">Subject</XlTh>
          <XlTh>Why it is here</XlTh>
          <XlTh align="left">Answers which request?</XlTh>
          <XlTh />
        </XlHeadRow>
      </XlHead>
      <tbody>
        {replies.length === 0 && <XlEmpty colSpan={7}>Every reply is placed.</XlEmpty>}
        {replies.map((r, i) => {
          const sel = picked[r.id] ?? []
          return (
            <XlRow key={r.id}>
              <XlNum n={i + 1} />
              <XlCell>{fmtDate(r.created_at)}</XlCell>
              <XlCell title={r.forwarded_by ? `Forwarded by ${r.forwarded_by}` : undefined}>{r.from_address ?? ''}{r.forwarded_by && <span style={{ color: MUTED }}> · fwd</span>}</XlCell>
              <XlCell align="left" title={r.subject ?? undefined} width={280}>
                {r.thread_id
                  ? <Link href={threadHref(r.thread_id) ?? '#'} className="block truncate no-underline hover:underline" style={{ color: INK }}>{r.subject || '(no subject)'}</Link>
                  : <span className="block truncate">{r.subject || '(no subject)'}</span>}
              </XlCell>
              <XlCell muted title={r.reason} width={200}><span className="block truncate">{r.reason}</span></XlCell>
              <XlCell align="left" nowrap={false}>
                {r.candidates.length === 0 && <span style={{ color: MUTED }}>No open request from this sender. Open the thread, or ignore.</span>}
                <span className="flex flex-col gap-0.5 py-1">
                  {r.candidates.map(c => (
                    <label key={c.dispatch_id} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={sel.includes(c.dispatch_id)} onChange={() => toggle(r.id, c.dispatch_id)} />
                      <span><b className="font-medium">{c.ref ?? '—'}</b> · {c.company_name ?? ''} · {c.line_label ?? ''} · {c.insurer_name}</span>
                    </label>
                  ))}
                </span>
                {errors[r.id] && <span className="block text-[12px]" style={{ color: ERROR }}>{errors[r.id]}</span>}
              </XlCell>
              <XlCell>
                <span className="inline-flex gap-1">
                  <Btn size="xs" level="secondary" className={XL_BTN} disabled={busy !== null || sel.length === 0} loading={busy === r.id} onClick={() => resolve(r, false)}>Place</Btn>
                  <Btn size="xs" level="tertiary" className={XL_BTN} disabled={busy !== null} onClick={() => resolve(r, true)}>Ignore</Btn>
                </span>
              </XlCell>
            </XlRow>
          )
        })}
      </tbody>
    </XlGrid>
  )
}
