'use client'

/**
 * The Policy page for a policy being worked on (the Workbench revamp, 19 Nov 2026): a facts line with
 * both stages, then Overview, Request, Quotes and Activity. Request is written by hand from the
 * line's checklist (src/lib/placement/request.ts) and becomes drafts for review and send; Quotes is one
 * table across rounds with Record reply for a quote typed from an insurer's email.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { Btn, Segmented, Spinner, inputCls } from '@/components/crm/primitives'
import { useConfirm } from '@/components/ui/confirm'
import { ReviewDraftsDrawer } from '@/components/placement/ReviewDraftsDrawer'
import { fmtDate, fmtDateTime, num } from '@/lib/format'
import { CLIENT_STAGES, INSURER_STAGES, REQUEST_TYPES, daysTo } from '@/lib/placement/working'
import { missingItems, requestBody, type RequestItem } from '@/lib/placement/request'

type Route = { contact_id: string; insurer: string; name: string | null; email: string; picked: boolean }
type File = { filename: string; mime_type?: string; storage_url: string }
type Quote = { id: string; dispatch_id: string | null; insurer: string; round_no: number | null; status: string; premium_text: string | null; premium_amount: number | null; excess_text: string | null; limit_text: string | null; valid_until: string | null; tier_label: string | null; created_at: string; extracted_by: string | null }
type Dispatch = { id: string; insurer: string; status: string; round_no: number | null; sent_at: string | null; chase_due: boolean; thread_href: string | null; draft_id: string | null }
type LogRow = { id: string; kind: string; actor: string; text: string; round_no: number | null; created_at: string }
type Ctx = {
  line: { id: string; product_line: string; request_type: string | null; existing: boolean | null; renewal_date: string | null; previous_premium: number | null; next_step: string | null }
  label: string; stages: { client: string; insurer: string }
  placement: { id: string; ref: string; company_id: string; inception_date: string | null; client_thread_id: string | null }
  company: { id: string; name: string }; thread: { id: string; subject: string | null } | null
  items: RequestItem[]; missing_asks: string[]; subject: string; deadline: string | null
  routes: Route[]; files: File[]; dispatches: Dispatch[]; quotes: Quote[]; log: LogRow[]; rounds: { id: string; round_no: number }[]
}
type Tab = 'overview' | 'request' | 'quotes' | 'activity'

const word = (list: readonly (readonly [string, string])[], k: string | null) => list.find(([v]) => v === k)?.[1] ?? null
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
const STATUS_WORD: Record<string, [string, string]> = { quoted: ['Quoted', 'text-trs-pos'], declined: ['Declined', 'text-trs-neg'], info_requested: ['Question', 'text-trs-warn'], sent: ['Asked', 'text-trs-muted'], acknowledged: ['Asked', 'text-trs-muted'], drafted: ['Draft not sent', 'text-trs-warn'], withdrawn: ['Withdrawn', 'text-trs-subtle'], expired: ['Expired', 'text-trs-neg'] }

function Track({ list, at }: { list: readonly (readonly [string, string])[]; at: string }) {
  const i = list.findIndex(([k]) => k === at)
  return <span className="inline-flex gap-[3px] w-[70px] align-middle mr-1.5" aria-hidden>{list.map((_, j) => <i key={j} className="flex-1 h-1 rounded-[2px]" style={{ background: j < i ? 'var(--trs-green)' : j === i ? 'var(--trs-ink)' : 'var(--trs-line-2)' }} />)}</span>
}
const Card = ({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-trs-line-2 bg-white">
    <header className="flex h-11 items-center justify-between border-b border-trs-line px-4 text-[14px] font-semibold text-trs-ink">{title}<span className="text-[12px] font-normal text-trs-muted">{meta}</span></header>
    {children}
  </section>
)

export function PolicyWorking({ lineId }: { lineId: string }) {
  const router = useRouter(), sp = useSearchParams()
  const tab = (['overview', 'request', 'quotes', 'activity'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'overview') as Tab
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<string | null | false>(false)
  const load = useCallback(async () => {
    const r = await fetch(`/api/placements/lines/${lineId}`, { cache: 'no-store' }); const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error ?? 'Could not load this policy'); else setCtx(j)
  }, [lineId])
  useEffect(() => { void load() }, [load])
  const setTab = (t: Tab) => router.replace(`/policies/working/${lineId}${t === 'overview' ? '' : `?tab=${t}`}`, { scroll: false })

  if (error) return <div className="px-4 sm:px-6 lg:px-10 py-6 text-[14px] text-trs-neg">{error}</div>
  if (!ctx) return <div className="px-4 sm:px-6 lg:px-10 py-6"><Spinner label="Loading the policy" /></div>
  const l = ctx.line, days = daysTo(l.renewal_date, today())
  const current = ctx.quotes.filter(q => q.status !== 'superseded' && !q.tier_label)
  const type = word(REQUEST_TYPES, l.request_type)

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0 max-w-[1440px]">
      <Breadcrumbs current={{ label: `${ctx.company.name} · ${ctx.label}`, href: `/policies/working/${lineId}` }} fallback={{ label: 'Policies', href: '/policies' }} />
      <PageHeader title={`${ctx.label}${type ? ` · ${type}` : ''}`}
        meta={<span className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <span><span className="text-trs-muted">Client </span><Link href={`/companies/${ctx.company.id}`} className="text-trs-ink">{ctx.company.name}</Link></span>
          <span><span className="text-trs-muted">Renews </span>{l.renewal_date ? <>{fmtDate(l.renewal_date)}{days != null && <> · <b className={days <= 21 ? 'text-trs-neg font-medium' : 'font-medium'}>{days} days</b></>}</> : '—'}</span>
          <span><span className="text-trs-muted">Previous premium </span>{l.previous_premium != null ? `S$${num(l.previous_premium, 0)}` : '—'}</span>
          <span><span className="text-trs-muted">Client side </span><Track list={CLIENT_STAGES} at={ctx.stages.client} />{word(CLIENT_STAGES, ctx.stages.client)}</span>
          <span><span className="text-trs-muted">Insurer side </span><Track list={INSURER_STAGES} at={ctx.stages.insurer} />{word(INSURER_STAGES, ctx.stages.insurer)}</span>
        </span>}
        actions={<>
          {ctx.thread && <Link href={`/engagement?lead=${ctx.thread.id}`} className="inline-flex h-9 items-center rounded-[8px] border border-trs-line-2 bg-white px-3.5 text-[14px] font-medium text-trs-ink no-underline">Open thread ↗</Link>}
          {current.length > 0 ? <ClientDraftButton placementId={ctx.placement.id} onDrafted={id => setDrawer(id)} /> : <Btn level="primary" onClick={() => setTab('request')}>Request to insurers</Btn>}
        </>}>
        <Segmented<Tab> value={tab} onChange={setTab} label="Policy sections" options={[
          { value: 'overview', label: 'Overview' }, { value: 'request', label: 'Request' },
          { value: 'quotes', label: 'Quotes', count: current.length }, { value: 'activity', label: 'Activity', count: ctx.log.length }]} />
      </PageHeader>

      {tab === 'overview' && <Overview ctx={ctx} onTab={setTab} />}
      {tab === 'request' && <RequestTab ctx={ctx} onDone={async () => { await load() }} onReview={id => setDrawer(id)} />}
      {tab === 'quotes' && <QuotesTab ctx={ctx} onChanged={load} onReview={id => setDrawer(id)} />}
      {tab === 'activity' && <LogTable rows={ctx.log} />}
      {drawer !== false && <ReviewDraftsDrawer companyId={ctx.company.id} open focus={drawer} onClose={() => setDrawer(false)} onChanged={() => void load()} />}
    </div>
  )
}

function ClientDraftButton({ placementId, onDrafted }: { placementId: string; onDrafted: (draftId: string | null) => void }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  return <span className="inline-flex flex-col items-end">
    <Btn level="primary" loading={busy} onClick={async () => {
      setBusy(true); setErr(null)
      const r = await fetch(`/api/placements/${placementId}/client-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const j = await r.json().catch(() => ({})); setBusy(false)
      if (!r.ok) setErr(j.error ?? 'Could not draft'); else onDrafted(j.draftId ?? null)
    }}>Draft to client</Btn>
    {err && <span className="mt-1 text-[12px] text-trs-neg">{err}</span>}
  </span>
}

function Overview({ ctx, onTab }: { ctx: Ctx; onTab: (t: Tab) => void }) {
  const miss = missingItems(ctx.items)
  const chase = ctx.dispatches.filter(d => d.chase_due)
  const questions = ctx.dispatches.filter(d => d.status === 'info_requested')
  const quoted = ctx.dispatches.filter(d => d.status === 'quoted')
  const steps: [string, string, Tab][] = []
  if (!ctx.dispatches.length) steps.push(['Request to insurers', miss.length ? `${miss.length} detail${miss.length === 1 ? '' : 's'} still missing` : 'Details complete', 'request'])
  if (miss.length) steps.push([`Ask the client for ${miss.length === 1 ? miss[0].label.toLowerCase() : `${miss.length} details`}`, miss.map(m => m.label).join(', '), 'request'])
  for (const d of chase) steps.push([`Follow up ${d.insurer}`, `No reply since ${d.sent_at ? fmtDate(d.sent_at) : 'the request'}`, 'quotes'])
  for (const d of questions) steps.push([`Answer ${d.insurer}'s question`, 'The insurer asked for more before quoting', 'quotes'])
  if (quoted.length) steps.push([`Send the client ${quoted.length} offer${quoted.length === 1 ? '' : 's'}`, quoted.map(d => d.insurer).join(', '), 'quotes'])
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Cover" meta={<button type="button" onClick={() => onTab('request')} className="border-0 bg-transparent p-0 text-[12px] text-trs-green underline cursor-pointer">Edit in Request</button>}>
        {ctx.items.filter(i => i.included).map(i => (
          <div key={i.key} className="grid grid-cols-[170px_minmax(0,1fr)] gap-3 border-b border-trs-line px-4 py-2.5 text-[13px] last:border-b-0">
            <span className="text-trs-muted">{i.label}</span>
            <span className={i.value.trim() ? 'text-trs-ink whitespace-pre-wrap' : 'text-trs-warn'}>{i.value.trim() || 'Missing'}</span>
          </div>))}
      </Card>
      <div className="flex flex-col gap-5">
        <Card title={`Next steps · ${steps.length}`} meta="By rule">
          {steps.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-trs-muted">Nothing to do until an insurer replies.</div>}
          <ol className="m-0 list-none p-0">{steps.map(([a, b, t], i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-trs-line px-4 py-2.5 last:border-b-0">
              <div className="min-w-0"><div className="text-[13.5px] font-medium text-trs-ink">{i + 1}. {a}</div><div className="text-[12px] text-trs-muted">{b}</div></div>
              <Btn size="xs" onClick={() => onTab(t)}>Open</Btn>
            </li>))}</ol>
        </Card>
        <Card title={`Documents · ${ctx.files.length}`} meta="From the client thread">
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {ctx.files.length === 0 && <span className="text-[13px] text-trs-muted">No files on the thread.</span>}
            {ctx.files.map(f => <a key={f.storage_url} href={f.storage_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-[6px] border border-trs-line-2 bg-trs-tint px-2 text-[12.5px] text-trs-ink no-underline"><FileTag name={f.filename} />{f.filename}</a>)}
          </div>
        </Card>
      </div>
    </div>
  )
}

const FileTag = ({ name }: { name: string }) => <span className="rounded-[3px] bg-trs-neg px-1 py-[2px] text-[9.5px] font-bold text-white">{(name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}</span>

function RequestTab({ ctx, onDone, onReview }: { ctx: Ctx; onDone: () => Promise<void>; onReview: (id: string | null) => void }) {
  const [items, setItems] = useState<RequestItem[]>(ctx.items)
  const [to, setTo] = useState<string[]>(ctx.routes.filter(r => r.picked).map(r => r.contact_id))
  const [att, setAtt] = useState<string[]>([])
  const [subject, setSubject] = useState(ctx.subject)
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<React.ReactNode>(null)
  const confirm = useConfirm()
  const files = ctx.files.filter(f => att.includes(f.storage_url))
  const built = useMemo(() => requestBody({ lineLabel: ctx.label, items, attachments: files.map(f => f.filename), deadline: ctx.deadline ? fmtDate(ctx.deadline) : null, sender: null }), [ctx.label, items, files, ctx.deadline])
  const [body, setBody] = useState(built)
  useEffect(() => { if (!edited) setBody(built) }, [built, edited])
  const miss = missingItems(items)
  const chosen = ctx.routes.filter(r => to.includes(r.contact_id)), spare = ctx.routes.filter(r => !to.includes(r.contact_id))
  const set = (k: string, f: (i: RequestItem) => RequestItem) => setItems(xs => xs.map(i => (i.key === k ? f(i) : i)))

  async function create() {
    setBusy(true); setNote(null)
    const r = await fetch(`/api/placements/lines/${ctx.line.id}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      items: items.map(i => ({ key: i.key, value: i.value, included: i.included })), contact_ids: to, subject, body, attachments: files.map(f => ({ storage_url: f.storage_url })) }) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setNote(<span className="text-trs-neg">{j.error ?? 'Could not create the drafts'}</span>); return }
    setNote(<span className="inline-flex items-center gap-3"><span className="text-trs-pos">✓ {j.dispatches} {j.dispatches === 1 ? 'email' : 'emails'} drafted · {fmtDateTime(new Date().toISOString())}{j.unrouted?.length ? ` · no contact on file for ${j.unrouted.join(', ')}` : ''}</span><Btn size="xs" level="primary" onClick={() => onReview(null)}>Review and send</Btn></span>)
    await onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      {note && <div className="text-[13px]" role="status">{note}</div>}
      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Card title="Request details" meta={`${items.filter(i => i.included).length} of ${items.length} included`}>
          {miss.length > 0 && <div className="flex items-center gap-2 border-b border-trs-line bg-trs-warn-bg px-4 py-2 text-[12.5px] text-trs-warn">
            <span className="h-[7px] w-[7px] flex-none rounded-full bg-current" />{miss.length} missing: {miss.map(m => m.label).join(', ')}
            <button type="button" className="ml-auto border-0 bg-transparent p-0 text-[12.5px] font-medium text-trs-green underline cursor-pointer"
              onClick={() => { void navigator.clipboard?.writeText(`Could you send us the following, so the insurers can quote:\n${miss.map(m => `- ${m.label}`).join('\n')}`).catch(() => {}); setNote(<span className="text-trs-pos">✓ The ask to the client is copied · paste it into your reply on the thread</span>) }}>Copy the ask to the client</button>
          </div>}
          <div role="list">{items.map(i => (
            <div key={i.key} role="listitem" className={`grid grid-cols-[32px_170px_minmax(0,1fr)] items-start border-b border-[#f0f1ee] px-3 last:border-b-0 ${i.included ? '' : 'opacity-60'}`}>
              <input type="checkbox" checked={i.included} aria-label={`Include ${i.label}`} onChange={e => set(i.key, x => ({ ...x, included: e.target.checked }))} className="mt-3 h-[15px] w-[15px] accent-[var(--trs-green)]" />
              <label className={`pt-2.5 pr-3 text-[13px] ${i.included && !i.value.trim() && i.key !== 'notes' ? 'text-trs-warn' : 'text-trs-muted'}`}>{i.label}</label>
              <AutoText value={i.value} placeholder={i.included && i.key !== 'notes' ? `Missing · ${i.hint}` : i.hint} label={i.label} onChange={v => set(i.key, x => ({ ...x, value: v }))} />
            </div>))}</div>
        </Card>
        <Card title="Email" meta={edited ? <>Edited by hand · <button type="button" onClick={() => { setEdited(false); setBody(built) }} className="border-0 bg-transparent p-0 text-[12px] text-trs-green underline cursor-pointer">Rebuild from details</button></> : 'Built from the details'}>
          <div className="flex min-h-[42px] items-center gap-3 border-b border-trs-line px-4 py-1"><span className="w-14 flex-none text-[13px] text-trs-muted">To</span>
            <span className="flex flex-wrap items-center gap-1.5">
              {chosen.map(r => <span key={r.contact_id} className="inline-flex h-[26px] items-center gap-1 rounded-full border border-trs-line-2 pl-2.5 pr-1 text-[12.5px]">{r.name ?? r.email}<span className="text-trs-subtle">· {r.insurer}</span>
                <button type="button" aria-label={`Remove ${r.name ?? r.email}`} className="h-5 w-5 rounded-full border-0 bg-transparent text-trs-subtle cursor-pointer hover:bg-trs-field" onClick={async () => { if (await confirm({ title: `Remove ${r.name ?? r.email} (${r.insurer})?`, body: 'They will not get this request. They can be added back.', action: 'Remove', danger: true })) setTo(t => t.filter(x => x !== r.contact_id)) }}>×</button></span>)}
              {spare.length > 0 && <select aria-label="Add an insurer contact" value="" onChange={e => e.target.value && setTo(t => [...t, e.target.value])} className="h-[26px] rounded-full border border-dashed border-trs-line-2 bg-white px-2 text-[12.5px] text-trs-green">
                <option value="">+ Add</option>{spare.map(r => <option key={r.contact_id} value={r.contact_id}>{r.insurer} · {r.name ?? r.email}</option>)}</select>}
              <span className="text-[12px] text-trs-muted">{chosen.length} separate {chosen.length === 1 ? 'email' : 'emails'}</span>
              {ctx.routes.length === 0 && <span className="text-[12px] text-trs-warn">No insurer contact on file for this line. Add one under Insurers.</span>}
            </span></div>
          <div className="flex min-h-[42px] items-center gap-3 border-b border-trs-line px-4"><span className="w-14 flex-none text-[13px] text-trs-muted">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} aria-label="Subject" className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[13.5px] font-medium text-trs-ink outline-none" /></div>
          <textarea value={body} onChange={e => { setEdited(true); setBody(e.target.value) }} aria-label="Message" className="min-h-[360px] flex-1 resize-none border-0 px-4 py-3.5 text-[13px] leading-relaxed text-trs-ink outline-none" />
          <div className="flex flex-wrap items-center gap-2 border-t border-trs-line px-4 py-2.5">
            {files.map(f => <span key={f.storage_url} className="inline-flex h-8 items-center gap-2 rounded-[6px] border border-trs-line-2 bg-trs-tint pl-1.5 pr-1 text-[12.5px]"><FileTag name={f.filename} />{f.filename}
              <button type="button" aria-label={`Remove ${f.filename}`} className="h-5 w-5 rounded-full border-0 bg-transparent text-trs-subtle cursor-pointer" onClick={async () => { if (await confirm({ title: `Remove ${f.filename}?`, body: 'It will not be attached. The file stays on the thread.', action: 'Remove', danger: true })) setAtt(a => a.filter(x => x !== f.storage_url)) }}>×</button></span>)}
            {ctx.files.some(f => !att.includes(f.storage_url)) && <select aria-label="Attach a file from the thread" value="" onChange={e => e.target.value && setAtt(a => [...a, e.target.value])} className="h-[26px] rounded-full border border-dashed border-trs-line-2 bg-white px-2 text-[12.5px] text-trs-green">
              <option value="">+ Attach from the thread</option>{ctx.files.filter(f => !att.includes(f.storage_url)).map(f => <option key={f.storage_url} value={f.storage_url}>{f.filename}</option>)}</select>}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-trs-line bg-trs-tint px-4 py-3">
            <Btn level="primary" loading={busy} disabled={!chosen.length || !subject.trim() || !body.trim()} onClick={() => void create()}>Draft {chosen.length} {chosen.length === 1 ? 'email' : 'emails'}</Btn>
            <span className="text-[12px] text-trs-muted">Nothing is sent from here. Each draft opens in review.</span>
          </footer>
        </Card>
      </div>
    </div>
  )
}

function AutoText({ value, placeholder, label, onChange }: { value: string; placeholder: string; label: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px` } }, [value])
  return <textarea ref={ref} rows={1} value={value} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value)}
    className="block min-h-[39px] w-full resize-none overflow-hidden border-0 border-b border-transparent bg-transparent py-2.5 text-[13px] leading-[18px] text-trs-ink outline-none placeholder:text-trs-subtle hover:border-trs-line-2 focus:border-b-2 focus:border-trs-green" />
}

function QuotesTab({ ctx, onChanged, onReview }: { ctx: Ctx; onChanged: () => Promise<void>; onReview: (id: string | null) => void }) {
  const [rec, setRec] = useState(false)
  const [note, setNote] = useState<React.ReactNode>(null)
  const insurers = useMemo(() => {
    const ds = ctx.dispatches.filter(d => d.status !== 'withdrawn')
    return ds.map(d => {
      const all = ctx.quotes.filter(q => q.dispatch_id === d.id || (q.insurer === d.insurer && !q.dispatch_id)).sort((a, b) => a.created_at.localeCompare(b.created_at))
      // The price on the line as asked; when the insurer priced only options, its latest option price.
      const base = all.filter(q => !q.tier_label), mine = base.length ? base : all
      const cur = mine.filter(q => q.status !== 'superseded').at(-1) ?? null
      const earlier = mine.filter(q => q !== cur && q.premium_amount != null).at(-1) ?? null
      return { d, cur, earlier }
    })
  }, [ctx])
  const low = Math.min(...insurers.map(x => x.cur?.premium_amount ?? Infinity))
  const prev = ctx.line.previous_premium
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-trs-muted">{insurers.length} insurers asked · round {Math.max(1, ...ctx.dispatches.map(d => d.round_no ?? 1))}{prev != null ? ` · previous premium S$${num(prev, 0)}` : ''}</span>
        <span className="flex gap-2"><Btn disabled title="Pending AI build">AI read replies</Btn><Btn disabled={!insurers.length} onClick={() => setRec(true)}>Record reply</Btn><Btn onClick={() => onReview(null)}>Review drafts</Btn></span>
      </div>
      {note && <div className="text-[13px]" role="status">{note}</div>}
      {insurers.length === 0 ? <div className="rounded-[10px] border border-trs-line px-4 py-8 text-center text-[14px] text-trs-muted">No insurer asked yet. Write the request first.</div> : (
        <div className="overflow-x-auto rounded-[10px] border border-[#dcdfd9]">
          <table className="trs-table q4" aria-label="Quotes by insurer" style={{ minWidth: 200 + insurers.length * 170 }}>
            <thead><tr><th className="sticky left-0 z-10 bg-[#f0f2ee] text-left">  </th>{insurers.map(x => <th key={x.d.id}>{x.d.insurer}</th>)}</tr></thead>
            <tbody>
              {([
                ['Status', x => { const s = STATUS_WORD[x.d.status] ?? [x.d.status, 'text-trs-muted']; return <span className={x.d.chase_due ? 'text-trs-neg' : s[1]}>{x.d.chase_due ? 'No reply · follow up' : s[0]}{x.d.round_no ? ` · round ${x.d.round_no}` : ''}</span> }],
                ['Premium S$', x => x.cur?.premium_amount != null ? <><b className="font-medium">{num(x.cur.premium_amount, 0)}</b>{x.cur.premium_amount === low && insurers.length > 1 && <span className="ml-1 text-[11px] text-trs-pos">lowest</span>}{x.cur.tier_label && <span className="block text-[12px] text-trs-muted">{x.cur.tier_label}</span>}{x.earlier?.premium_amount != null && <span className="block text-[12px] text-trs-muted">was {num(x.earlier.premium_amount, 0)}{x.earlier.round_no ? ` · round ${x.earlier.round_no}` : ''}</span>}</> : x.cur?.premium_text ? <span className="whitespace-normal text-[12.5px]">{x.cur.premium_text}</span> : '—'],
                ['Against previous', x => { if (x.cur?.premium_amount == null || prev == null) return '—'; const dlt = x.cur.premium_amount - prev; return dlt === 0 ? 'Same' : <span className={dlt < 0 ? 'text-trs-pos' : 'text-trs-neg'}>S${num(Math.abs(dlt), 0)} {dlt < 0 ? 'less' : 'more'}</span> }],
                ['Excess', x => x.cur?.excess_text ?? '—'],
                ['Valid until', x => x.cur?.valid_until ? fmtDate(x.cur.valid_until) : '—'],
                ['Last email', x => x.d.thread_href ? <a href={x.d.thread_href} className="text-trs-ink underline decoration-trs-line-2 underline-offset-[3px]">{x.d.sent_at ? fmtDate(x.d.sent_at) : 'Thread'} ↗</a> : (x.d.status === 'drafted' ? 'Not sent' : '—')],
              ] as [string, (x: typeof insurers[number]) => React.ReactNode][]).map(([label, f]) => (
                <tr key={label}><td className="sticky left-0 z-10 bg-white font-medium cell-left">{label}</td>{insurers.map(x => <td key={x.d.id}>{f(x)}</td>)}</tr>))}
            </tbody>
          </table>
        </div>)}
      <div className="text-[14px] font-semibold text-trs-ink">Activity · {ctx.log.length}</div>
      <LogTable rows={ctx.log.slice(0, 30)} />
      {rec && <RecordReply dispatches={ctx.dispatches.filter(d => d.status !== 'withdrawn')} onClose={() => setRec(false)} onSaved={async words => { setRec(false); setNote(<span className="text-trs-pos">✓ Saved · {words} · logged {fmtDateTime(new Date().toISOString())}</span>); await onChanged() }} />}
    </div>
  )
}

function RecordReply({ dispatches, onClose, onSaved }: { dispatches: Dispatch[]; onClose: () => void; onSaved: (words: string) => void }) {
  const [d, setD] = useState(dispatches[0]?.id ?? '')
  const [f, setF] = useState({ premium: '', excess: '', limit: '', valid_until: '', note: '' })
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const field = (k: keyof typeof f, label: string, type = 'text') => <label className="flex flex-col gap-1.5 text-[12.5px] text-trs-muted">{label}<input type={type} className={inputCls} value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} /></label>
  return (
    <DialogPrimitive.Root open onOpenChange={o => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="trs-modal-overlay fixed inset-0 z-[100]" />
        <DialogPrimitive.Content aria-describedby={undefined} className="trs-modal-panel fixed left-1/2 top-1/2 z-[101] flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[28px] bg-white px-8 pt-7 pb-6 shadow-[0_30px_80px_rgba(15,20,18,0.25)] focus:outline-none">
          <DialogPrimitive.Close aria-label="Close" className="absolute right-[18px] top-[18px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-[#e8e8ed] text-[#3a3a3c] cursor-pointer"><X size={16} /></DialogPrimitive.Close>
          <DialogPrimitive.Title className="m-0 pr-10 text-[22px] font-semibold text-trs-ink">Record reply</DialogPrimitive.Title>
          <div className="text-[13.5px] text-trs-muted">Enter what the insurer&apos;s email quoted. The earlier price stays in the history.</div>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-trs-muted">Insurer<select className={inputCls} value={d} onChange={e => setD(e.target.value)}>{dispatches.map(x => <option key={x.id} value={x.id}>{x.insurer}{x.round_no ? ` · round ${x.round_no}` : ''}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">{field('premium', 'Premium S$')}{field('excess', 'Excess')}{field('limit', 'Limit')}{field('valid_until', 'Valid until', 'date')}</div>
          {field('note', 'Note')}
          {err && <div className="text-[13px] text-trs-neg">{err}</div>}
          <div className="flex justify-end gap-2 pt-2"><Btn onClick={onClose}>Cancel</Btn><Btn level="primary" loading={busy} onClick={async () => {
            setBusy(true); setErr(null)
            const r = await fetch(`/api/placements/dispatches/${d}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
            const j = await r.json().catch(() => ({})); setBusy(false)
            if (!r.ok) setErr(j.error ?? 'Could not save'); else onSaved(`${dispatches.find(x => x.id === d)?.insurer} quoted ${f.premium}`)
          }}>Save to table</Btn></div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function LogTable({ rows }: { rows: LogRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-[#dcdfd9]">
      <table className="trs-table" aria-label="Activity" style={{ minWidth: 720 }}>
        <thead><tr><th>Date</th><th>Round</th><th>Who</th><th>Event</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="cell-empty">Nothing yet.</td></tr>}
          {rows.map(r => <tr key={r.id}><td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</td><td>{r.round_no ?? '—'}</td><td>{r.actor.split('@')[0]}</td><td className="cell-left">{r.text}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}
