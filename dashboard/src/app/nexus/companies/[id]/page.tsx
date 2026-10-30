'use client'

/**
 * Nexus for one client: every email between the client and TRS and between TRS and each insurer,
 * newest first, beside the open follow-ups and the latest analysis (stage, scenarios with
 * probability, next steps). A message opens its thread in the reader.
 */
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { Btn, Chip, Empty, Segmented, Spinner } from '@/components/crm/primitives'
import { ThreadModal } from '@/components/engagement/ThreadModal'
import { callApi, errText, INK, MUTED, ERROR } from '@/components/placement/shared'
import { fmtDate } from '@/lib/crm/format'
import type { CompanyNexusView, NexusMessage, Party } from '@/lib/nexus/company-view'

type Filter = 'all' | 'client' | 'insurer'
const PARTY: Record<Party, { tone: 'amber' | 'green' | 'blue' | 'neutral'; label: string }> = {
  client: { tone: 'amber', label: 'Client' }, trs: { tone: 'green', label: 'TRS' }, insurer: { tone: 'blue', label: 'Insurer' }, other: { tone: 'neutral', label: 'Other' },
}
const OWNER: Record<string, { tone: 'amber' | 'green' | 'blue' | 'neutral'; label: string }> = {
  trs: { tone: 'green', label: 'TRS' }, insurer: { tone: 'blue', label: 'Insurer' }, client: { tone: 'amber', label: 'Client' }, date: { tone: 'neutral', label: 'Date' },
}
const PROB: Record<string, number> = { high: 0.7, medium: 0.4, moderate: 0.4, low: 0.15 }
const probOf = (p: string) => { const n = Number(String(p).match(/\d+/)?.[0]); return Number.isFinite(n) && /\d/.test(p) ? n / 100 : PROB[String(p).toLowerCase()] ?? 0.15 }
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }) : '')
const dayKey = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }) : 'Undated')

export default function CompanyNexusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [view, setView] = useState<CompanyNexusView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [reading, setReading] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    callApi<CompanyNexusView>(`/api/nexus/companies/${id}`).then(setView).catch(e => setError(errText(e)))
  }, [id])
  useEffect(() => { load() }, [load])

  const threadOf = useMemo(() => new Map((view?.threads ?? []).map(t => [t.id, t])), [view])
  const shown = useMemo(() => (view?.messages ?? []).filter(m => {
    const kind = threadOf.get(m.thread_id)?.kind
    return filter === 'all' || (filter === 'client' ? kind === 'client' : kind === 'insurer')
  }), [view, filter, threadOf])
  const days = useMemo(() => {
    const out: { day: string; items: NexusMessage[] }[] = []
    for (const m of shown) { const k = dayKey(m.sent_at); const last = out.at(-1); if (last?.day === k) last.items.push(m); else out.push({ day: k, items: [m] }) }
    return out
  }, [shown])

  async function analyse() {
    setBusy(true); setError(null)
    try {
      const r = await callApi<{ case_id: string }>(`/api/nexus/companies/${id}/case`, { method: 'POST', body: {} })
      router.push(`/nexus/cases?case=${r.case_id}`)
    } catch (e) { setError(errText(e)); setBusy(false) }
  }

  if (error && !view) return <div className="px-6 md:px-8 py-6 max-w-[1320px] mx-auto"><p className="m-0 text-[14px]" style={{ color: ERROR }}>{error}</p></div>
  if (!view) return <Spinner label="Loading correspondence…" />

  const insurers = [...new Set(view.threads.filter(t => t.kind === 'insurer').map(t => t.insurer).filter(Boolean))] as string[]
  const nClient = view.messages.filter(m => threadOf.get(m.thread_id)?.kind === 'client').length
  const a = view.analysis

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 max-w-[1320px] mx-auto" style={{ color: INK }}>
      <Link href="/nexus" className="text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Nexus</Link>
      <div className="flex items-end justify-between gap-4 flex-wrap mt-3 mb-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em] truncate">{view.company.name}</h1>
          <p className="m-0 mt-1 text-[14px]" style={{ color: MUTED }}>
            {view.messages.length} emails · {view.threads.length} threads · {insurers.length} insurer{insurers.length === 1 ? '' : 's'}{insurers.length ? `: ${insurers.join(', ')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/companies/${id}`} className="text-[14px] no-underline hover:underline mr-2" style={{ color: INK }}>Company page</Link>
          <Btn level="primary" loading={busy} onClick={() => void analyse()}>{a ? 'Update analysis' : 'Run analysis'}</Btn>
        </div>
      </div>
      {error && <p className="m-0 mb-3 text-[13.5px]" style={{ color: ERROR }}>{error}</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <section className="min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="m-0 text-[16px] font-medium">Timeline</h2>
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: view.messages.length },
              { value: 'client', label: 'Client ↔ TRS', count: nClient },
              { value: 'insurer', label: 'TRS ↔ insurers', count: view.messages.length - nClient },
            ]} />
          </div>
          {days.length === 0 ? <Empty>No emails on file for this client.</Empty> : (
            <ol className="list-none m-0 p-0">
              {days.map(d => (
                <li key={d.day} className="mb-5">
                  <div className="text-[12.5px] font-medium uppercase tracking-[0.06em] mb-1.5" style={{ color: MUTED }}>{d.day === 'Undated' ? d.day : fmtDate(d.day)}</div>
                  <ol className="list-none m-0 p-0 border-l border-[#e6e8e4]">
                    {d.items.map(m => {
                      const t = threadOf.get(m.thread_id)
                      return (
                        <li key={m.id}>
                          <button type="button" onClick={() => setReading(m.thread_id)}
                            className="w-full text-left bg-transparent border-0 cursor-pointer pl-4 pr-2 py-2.5 rounded-r-[8px] hover:bg-[#f4f5f2] focus-visible:bg-[#f4f5f2] outline-none grid grid-cols-[44px_minmax(0,1fr)] gap-x-3">
                            <span className="text-[12.5px] tabular-nums pt-0.5" style={{ color: MUTED }}>{time(m.sent_at)}</span>
                            <span className="min-w-0 flex flex-col gap-1">
                              <span className="flex items-center gap-2 min-w-0 flex-wrap">
                                <Chip tone={PARTY[m.party].tone}>{PARTY[m.party].label}</Chip>
                                <span className="text-[14px] font-medium truncate">{m.who}</span>
                                <span className="text-[13px]" style={{ color: MUTED }}>→ {m.to_party}</span>
                                {m.has_attachments && <Paperclip size={13} style={{ color: MUTED }} aria-label="Has attachments" />}
                              </span>
                              <span className="text-[13px] truncate" style={{ color: MUTED }}>{t?.title ?? m.subject}</span>
                              {m.snippet && <span className="text-[14px] leading-[1.5] line-clamp-2" style={{ color: '#2a332f' }}>{m.snippet}</span>}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="min-w-0 flex flex-col gap-8 lg:sticky lg:top-[72px]">
          <section>
            <h2 className="m-0 mb-3 text-[16px] font-medium">Analysis</h2>
            {!a || (!a.summary && a.scenarios.length === 0) ? (
              <p className="m-0 text-[14px]" style={{ color: MUTED }}>No analysis yet. Run analysis reads all {view.threads.length} threads.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="m-0 text-[13px]" style={{ color: MUTED }}>
                  {a.analysed_at ? `Analysed ${fmtDate(a.analysed_at)}` : 'Not analysed'} · {a.linked_threads} threads · <Link href={`/nexus/cases?case=${a.case_id}`} className="underline underline-offset-4" style={{ color: INK }}>Open case</Link>
                </p>
                {a.stage && <div><div className="text-[12.5px] mb-1" style={{ color: MUTED }}>Stage</div><div className="text-[14px] font-medium">{a.stage}</div></div>}
                {a.summary && <p className="m-0 text-[14px] leading-[1.55]">{a.summary}</p>}
                {a.blocking.length > 0 && (
                  <div><div className="text-[12.5px] mb-1" style={{ color: MUTED }}>Blocking</div>
                    <ul className="m-0 pl-4 text-[14px] leading-[1.5]">{a.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
                )}
                {a.scenarios.length > 0 && (
                  <div><div className="text-[12.5px] mb-2" style={{ color: MUTED }}>Scenarios</div>
                    <ul className="list-none m-0 p-0 flex flex-col gap-3">
                      {a.scenarios.map((s, i) => {
                        const p = probOf(s.probability)
                        return (
                          <li key={i}>
                            <div className="flex items-baseline justify-between gap-3"><span className="text-[14px] font-medium">{s.name}</span><span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{s.probability}</span></div>
                            <div className="h-[6px] rounded-full mt-1.5 bg-[#eef0ec] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round(p * 100)}%`, background: '#132c1c' }} /></div>
                            <div className="text-[13px] mt-1.5 leading-[1.5]" style={{ color: '#2a332f' }}>{s.outcome}</div>
                            {s.trs_action && <div className="text-[13px] mt-0.5" style={{ color: MUTED }}>TRS: {s.trs_action}</div>}
                          </li>
                        )
                      })}
                    </ul></div>
                )}
                {a.next_steps.length > 0 && (
                  <div><div className="text-[12.5px] mb-2" style={{ color: MUTED }}>Next steps</div>
                    <ol className="m-0 pl-5 flex flex-col gap-2 text-[14px] leading-[1.5]">
                      {a.next_steps.slice(0, 6).map((s, i) => (
                        <li key={i}><span className="font-medium">{s.action}</span><span className="block text-[13px]" style={{ color: MUTED }}>{[s.owner, s.deadline, s.priority].filter(Boolean).join(' · ')}</span></li>
                      ))}
                    </ol></div>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="m-0 mb-3 text-[16px] font-medium">Follow-ups <span className="text-[13px] font-normal tabular-nums" style={{ color: MUTED }}>{view.follow_ups.length}</span></h2>
            {view.follow_ups.length === 0 ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Nothing open.</p> : (
              <ul className="list-none m-0 p-0 flex flex-col">
                {view.follow_ups.map(f => {
                  const o = OWNER[f.owner_party] ?? OWNER.date
                  const late = f.due_at && Date.parse(f.due_at) < Date.now()
                  return (
                    <li key={f.id}>
                      <button type="button" disabled={!f.thread_id} onClick={() => f.thread_id && setReading(f.thread_id)}
                        className="w-full text-left bg-transparent border-0 cursor-pointer py-2.5 border-b border-[#eef0ec] last:border-b-0 hover:bg-[#f4f5f2] outline-none flex flex-col gap-1 px-1">
                        <span className="flex items-center gap-2"><Chip tone={o.tone}>{o.label}</Chip>
                          {f.counterparty_name && <span className="text-[13px] truncate" style={{ color: MUTED }}>{f.counterparty_name}</span>}
                          <span className="ml-auto text-[13px] tabular-nums whitespace-nowrap" style={{ color: late ? ERROR : MUTED }}>{f.due_at ? fmtDate(f.due_at) : '—'}</span></span>
                        <span className="text-[14px] leading-[1.45]">{f.what}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <ThreadModal threadId={reading} onClose={() => setReading(null)} />
    </div>
  )
}
