'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Btn, Chip, SectionCard } from '@/components/crm/primitives'
import { MarketingPage, MUTED, RULE, Note } from '@/components/marketing/page-shell'
import { useSiteKey, useSites, withSite } from '@/components/marketing/site-switch'
import { NodeStatusChip, RunStatusChip } from '@/components/marketing/chips'
import { Prose } from '@/components/marketing/prose'
import { ENGINE_NODE_DEFS, fmtDuration } from '@/lib/marketing/engine'
import { renderMarkdown } from '@/lib/marketing/markdown'
import { fmtDate } from '@/lib/marketing/labels'
import type { RunDetail, RunNode } from '@/lib/marketing/types'

const INK = '#0f1412'
const ACTIVE = new Set(['queued', 'running'])

export default function RunPage() {
  return <Suspense fallback={null}><Run /></Suspense>
}

/** One engine run: the twelve stages, what each one read and wrote, the activity log, the draft. */
function Run() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { sites } = useSites()
  const [siteKey, setSiteKey] = useSiteKey(sites)
  const [data, setData] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!siteKey) return false
    try {
      const res = await fetch(`/api/marketing/runs/${id}?site=${siteKey}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not load the run')
      setData(j); setError(null)
      return ACTIVE.has((j as RunDetail).run.status)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false }
  }, [id, siteKey])

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => { const active = await load(); if (alive && active) timer = setTimeout(tick, 2000) }
    void tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const run = data?.run
  const nodes = data?.nodes ?? []
  const isActive = !!run && ACTIVE.has(run.status)
  const elapsed = run?.started_at ? (run.completed_at ? new Date(run.completed_at).getTime() : now) - new Date(run.started_at).getTime() : 0
  const done = nodes.filter(n => n.status === 'completed').length
  const cost = nodes.reduce((s, n) => s + (typeof n.metadata?.cost_usd === 'number' ? (n.metadata.cost_usd as number) : 0), 0)
  const gate = run?.geo_quality?.engine
  const node = nodes.find(n => n.node_key === selected) ?? null
  const draft = run?.draft
  const html = useMemo(() => (draft?.markdown ? renderMarkdown(draft.markdown) : ''), [draft?.markdown])
  const title = run?.setup.focus?.label || run?.setup.topic || draft?.title || 'Run'

  async function act(path: 'cancel' | 'retry') {
    if (!siteKey) return
    setBusy(true); setNote(null)
    try {
      const res = await fetch(`/api/marketing/runs/${id}/${path}?site=${siteKey}`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setError(j.error ?? 'Request failed'); else setNote(j.note ?? (path === 'cancel' ? 'Cancelling at the next stage' : 'Resuming from the last completed stage'))
      await load()
    } finally { setBusy(false) }
  }

  return (
    <MarketingPage
      back={<Link href={withSite('/marketing/generate', siteKey)} className="underline underline-offset-2" style={{ color: MUTED }}>← Generate</Link>}
      title={title}
      line={run && <span className="inline-flex items-center gap-2 flex-wrap"><RunStatusChip status={run.status} />{gate && <Chip>{gate.passed_gate ? 'Gate passed' : 'Held by gate'}</Chip>}{run.article_status && <Chip>{run.article_status === 'pending' ? 'Article awaiting approval' : `Article ${run.article_status}`}</Chip>}</span>}
      line2={run && <>{done} of {nodes.length} stages · {fmtDuration(run.total_duration_ms ?? elapsed)} · US${cost.toFixed(2)} · {run.setup.market}{run.setup.target_query ? ` · search: ${run.setup.target_query}` : ''} · started {fmtDate(run.created_at, true)}{run.created_by ? ` by ${run.created_by}` : ''}{run.error ? ` · ${run.error}` : ''}</>}
      sites={sites} siteKey={siteKey} onSite={k => { setSiteKey(k); router.push(`/marketing/generate?site=${k}`) }}
      actions={run && <>
        {isActive && <Btn level="secondary" disabled={busy} onClick={() => act('cancel')}>Cancel</Btn>}
        {(run.status === 'failed' || run.status === 'cancelled') && <Btn level="primary" disabled={busy} onClick={() => act('retry')}>Resume run</Btn>}
        {run.status === 'completed' && run.article_id && <Btn level="primary" onClick={() => router.push(withSite(`/marketing/articles/${run.article_id}`, siteKey))}>{run.article_status === 'pending' ? 'Review article' : 'Open article'}</Btn>}
      </>}
    >
      {error && <Note role="alert">{error}</Note>}
      {note && <Note role="status">{note}</Note>}
      {!data && !error && <Note>Loading…</Note>}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 flex flex-col gap-6">
            <SectionCard title="Stages" padded={false}>
              <ol className="m-0 p-0 list-none">
                {ENGINE_NODE_DEFS.map((d, i) => {
                  const nd = nodes.find(x => x.node_key === d.key)
                  const on = selected === d.key
                  const cost = typeof nd?.metadata?.cost_usd === 'number' ? (nd.metadata.cost_usd as number) : null
                  return (
                    <li key={d.key} style={{ borderBottom: i < ENGINE_NODE_DEFS.length - 1 ? `1px solid ${RULE}` : undefined }}>
                      <button type="button" onClick={() => setSelected(on ? null : d.key)} aria-current={on ? 'step' : undefined}
                        className={cn('w-full flex items-center gap-3 px-5 py-3 text-left bg-transparent border-0 cursor-pointer hover:bg-[#faf9f6]', on && 'bg-[#f1f2ee]')} style={{ color: INK }}>
                        <span className="w-6 text-[13px] tabular-nums flex-shrink-0" style={{ color: MUTED }}>{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-medium truncate">{d.label}</span>
                          <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{nd?.status === 'completed' ? [fmtDuration(nd.duration_ms), cost != null && cost > 0 ? `$${cost.toFixed(3)}` : null, nd.model && nd.model !== 'none' ? nd.model : null].filter(Boolean).join(' · ') : nd?.status === 'failed' ? nd.error?.slice(0, 120) : d.example}</span>
                        </span>
                        <NodeStatusChip status={nd?.status ?? 'queued'} />
                      </button>
                    </li>
                  )
                })}
              </ol>
            </SectionCard>
            <SectionCard title={`Activity (${data.events.length})`}>
              {data.events.length === 0 ? <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>Nothing yet.</p> : (
                <ol className="m-0 p-0 list-none flex flex-col gap-1.5 text-[13.5px] max-h-[360px] overflow-auto">
                  {data.events.map(e => (
                    <li key={e.id} className="grid grid-cols-[64px_80px_1fr] gap-2">
                      <span className="tabular-nums" style={{ color: MUTED }}>{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(new Date(e.created_at))}</span>
                      <span className="truncate" style={{ color: MUTED }}>{e.node_key ?? e.level}</span>
                      <span className="break-words">{e.message}</span>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
            {run?.status === 'completed' && draft?.markdown && (
              <SectionCard title="Draft">
                <h3 className="m-0 mb-3 text-[22px] font-medium tracking-[-0.02em]">{draft.title}</h3>
                <Prose html={html} />
              </SectionCard>
            )}
          </div>
          <Inspector node={node} sources={data.sources} onClose={() => setSelected(null)} />
        </div>
      )}
    </MarketingPage>
  )
}

function Inspector({ node, sources, onClose }: { node: RunNode | null; sources: RunDetail['sources']; onClose: () => void }) {
  if (!node) return <SectionCard title="Stage detail" className="border-t-0 pt-0"><p className="m-0 text-[13.5px]" style={{ color: MUTED }}>Select a stage to see its prompt, inputs, output and sources.</p></SectionCard>
  const referenced = new Set(node.source_ids)
  const used = sources.filter(s => referenced.has(s.doc_id))
  const meta = node.metadata as { cost_usd?: number; fact_ids?: string[]; provider?: string; attempts?: number; round?: number; verdict?: string }
  return (
    <SectionCard title={node.label} className="border-t-0 pt-0" actions={<Btn level="tertiary" size="xs" onClick={onClose}>Close</Btn>}>
      <div className="flex flex-col gap-4 text-[13.5px]">
        <p className="m-0 flex items-center gap-2 flex-wrap"><NodeStatusChip status={node.status} />{node.duration_ms != null && <span style={{ color: MUTED }}>{fmtDuration(node.duration_ms)}</span>}{used.length > 0 && <span style={{ color: MUTED }}>· {used.length} sources</span>}</p>
        {node.error && <p className="m-0">{node.error}</p>}
        {node.prompt && <Block title="Prompt" text={node.prompt} />}
        {node.input_summary && <Block title="Inputs" text={node.input_summary} />}
        {node.output_summary && <Block title="Output" text={node.output_summary} />}
        {used.length > 0 && (
          <div>
            <p className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: MUTED }}>Sources</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {used.map(s => (
                <li key={s.id} className="rounded-[10px] p-2.5" style={{ border: `1px solid ${RULE}` }}>
                  <p className="m-0 font-medium">{s.title}</p>
                  <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{s.used_in.length ? `Facts ${s.used_in.join(', ')}` : 'Loaded, not cited'}{s.score != null ? ` · match ${Math.round(s.score * 100)}%` : ''}</p>
                  {s.excerpt && <p className="m-0 mt-1 text-[12.5px]">{s.excerpt.slice(0, 200)}{s.excerpt.length > 200 ? '…' : ''}</p>}
                  {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[12.5px] underline underline-offset-2" style={{ color: INK }}>Source ↗</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="m-0 grid grid-cols-[90px_1fr] gap-x-3 gap-y-1">
          {node.model && <><dt style={{ color: MUTED }}>Model</dt><dd className="m-0 break-all">{node.model}</dd></>}
          {node.token_usage && <><dt style={{ color: MUTED }}>Tokens</dt><dd className="m-0 tabular-nums">{node.token_usage.input ?? 0} in · {node.token_usage.output ?? 0} out</dd></>}
          {typeof meta.cost_usd === 'number' && <><dt style={{ color: MUTED }}>Cost</dt><dd className="m-0 tabular-nums">${meta.cost_usd.toFixed(4)}</dd></>}
          {meta.provider && <><dt style={{ color: MUTED }}>Provider</dt><dd className="m-0">{meta.provider}{meta.attempts && meta.attempts > 1 ? ` · attempt ${meta.attempts}` : ''}</dd></>}
          {meta.verdict && <><dt style={{ color: MUTED }}>Verdict</dt><dd className="m-0">{meta.verdict}{typeof meta.round === 'number' ? ` · round ${meta.round}` : ''}</dd></>}
          {Array.isArray(meta.fact_ids) && meta.fact_ids.length > 0 && <><dt style={{ color: MUTED }}>Facts</dt><dd className="m-0 break-words">{meta.fact_ids.join(', ')}</dd></>}
          {node.started_at && <><dt style={{ color: MUTED }}>Started</dt><dd className="m-0">{fmtDate(node.started_at, true)}</dd></>}
        </dl>
      </div>
    </SectionCard>
  )
}

function Block({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 600
  return (
    <div>
      <p className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: MUTED }}>{title}</p>
      <pre className="m-0 whitespace-pre-wrap break-words rounded-[10px] bg-[#faf9f6] p-2.5 font-mono text-[11.5px] leading-[1.5]" style={{ color: INK }}>{long && !open ? `${text.slice(0, 600)}…` : text}</pre>
      {long && <button type="button" onClick={() => setOpen(v => !v)} className="mt-1 bg-transparent border-0 p-0 cursor-pointer text-[12.5px] underline underline-offset-2" style={{ color: INK }}>{open ? 'Show less' : 'Show all'}</button>}
    </div>
  )
}
