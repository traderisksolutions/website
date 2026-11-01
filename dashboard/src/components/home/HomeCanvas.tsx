'use client'

/**
 * The home canvas: client on the left, insurer on the right, TRS between them. Three bridge rows
 * (RFQ and renewals, Claims, Endorsements and billing). A case is a small card on the side that
 * owes the next move; the centre holds the bridge card and what TRS itself owes. Dotted wires
 * carry the count waiting on each side. Every card, count and label opens the matching list or
 * case, and a card's menu carries the same actions as Today. On a phone each bridge stacks.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { callApi, errText } from '@/components/placement/shared'
import { ThreadModal } from '@/components/assistant/shared'
import { LATER_CHOICES, LATER_LABEL, type LaterChoice } from '@/lib/today/rules'
import { BRIDGE_LABEL, type PendingLevel, type HomeBridge } from '@/lib/today/pending'
import type { HomeCanvas as Canvas, HomeBridgeData, HomeCard } from '@/lib/today/data'

type Staff = { email: string; name: string }

const DOT: Record<PendingLevel, string> = { red: 'bg-trs-neg-bg text-trs-neg', amber: 'bg-trs-warn-bg text-trs-warn', green: 'bg-trs-pos-bg text-trs-pos', grey: 'bg-trs-canvas text-trs-muted border border-trs-line' }
const ACTION_LABEL: Record<HomeCard['action'], string> = { send: 'Review and send', forward: 'Review and forward', decide: 'Decide', read: 'Mark read', open: 'Open' }
const GRID = 'radial-gradient(var(--trs-line-2) 1px, transparent 1px)'

export function HomeCanvas({ data, staff, onChanged }: { data: Canvas; staff: Staff[]; onChanged: (notice: string) => void }) {
  const [thread, setThread] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <section aria-label="Client, TRS and insurer" className="rounded-[14px] border border-trs-line p-4 md:p-6 flex flex-col gap-4 min-w-0"
      style={{ backgroundColor: 'var(--trs-canvas)', backgroundImage: GRID, backgroundSize: '18px 18px' }}>
      {error && <p className="m-0 text-[13.5px] text-trs-neg" role="alert">{error}</p>}
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_48px_330px_48px_minmax(0,1fr)] gap-x-2 items-center">
        <Head name="Client" sub={`${data.clients} with open work`} href="/companies" />
        <span />
        <Link href="/today" className="text-center font-serif text-[20px] text-trs-ink no-underline">TRS <span className="font-mono text-[11px] text-trs-muted ml-1">{data.open} open</span></Link>
        <span />
        <Head name="Insurer" sub={`${data.insurers} with open work`} href="/insurers" right />
        {data.bridges.map(b => <WideRow key={b.key} b={b} staff={staff} onThread={setThread} onChanged={onChanged} onError={setError} />)}
      </div>
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between text-[12.5px] text-trs-muted"><span>Client · {data.clients}</span><span className="font-serif text-[18px] text-trs-ink">TRS</span><span>Insurer · {data.insurers}</span></div>
        {data.bridges.map(b => (
          <div key={b.key} className="flex flex-col gap-2">
            <BridgeCard b={b} />
            {b.centre.map(c => <Card key={c.id} c={c} staff={staff} onThread={setThread} onChanged={onChanged} onError={setError} />)}
            {b.client.length > 0 && <RowLabel>On client · {b.waiting_client}</RowLabel>}
            {b.client.map(c => <Card key={c.id} c={c} staff={staff} onThread={setThread} onChanged={onChanged} onError={setError} />)}
            {b.insurer.length > 0 && <RowLabel>On insurer · {b.waiting_insurer}</RowLabel>}
            {b.insurer.map(c => <Card key={c.id} c={c} staff={staff} onThread={setThread} onChanged={onChanged} onError={setError} />)}
          </div>
        ))}
      </div>
      <Legend />
      <ThreadModal threadId={thread} onClose={() => setThread(null)} />
    </section>
  )
}

function Head({ name, sub, href, right }: { name: string; sub: string; href: string; right?: boolean }) {
  return (
    <Link href={href} className={`font-serif text-[20px] text-trs-ink no-underline ${right ? 'text-right' : ''}`}>
      {right && <span className="font-mono text-[11px] text-trs-muted mr-2">{sub}</span>}{name}{!right && <span className="font-mono text-[11px] text-trs-muted ml-2">{sub}</span>}
    </Link>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full pt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-trs-muted">{children}</div>
}

function WideRow({ b, staff, onThread, onChanged, onError }: { b: HomeBridgeData; staff: Staff[]; onThread: (id: string) => void; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const list = `/today?bridge=${b.key}`
  return (
    <>
      <RowLabel>{BRIDGE_LABEL[b.key]}</RowLabel>
      <div className="flex flex-col gap-2 min-w-0 py-2">
        {b.client.map(c => <Card key={c.id} c={c} staff={staff} onThread={onThread} onChanged={onChanged} onError={onError} />)}
        {b.more_client > 0 && <More href={`${list}&side=client`} n={b.more_client} who="waiting on client" />}
        {b.client.length === 0 && <Empty>Nothing waiting on the client</Empty>}
      </div>
      <Wire href={`${list}&side=client`} label={`${b.waiting_client} on client`} />
      <div className="flex flex-col gap-2 min-w-0 py-2">
        <BridgeCard b={b} />
        {b.centre.map(c => <Card key={c.id} c={c} staff={staff} onThread={onThread} onChanged={onChanged} onError={onError} />)}
        {b.more_centre > 0 && <More href={`${list}&side=trs`} n={b.more_centre} who="for TRS" />}
      </div>
      <Wire href={`${list}&side=insurer`} label={`${b.waiting_insurer} on insurer`} />
      <div className="flex flex-col gap-2 min-w-0 py-2">
        {b.insurer.map(c => <Card key={c.id} c={c} staff={staff} onThread={onThread} onChanged={onChanged} onError={onError} />)}
        {b.more_insurer > 0 && <More href={`${list}&side=insurer`} n={b.more_insurer} who="waiting on insurer" />}
        {b.insurer.length === 0 && <Empty>Nothing waiting on the insurer</Empty>}
      </div>
    </>
  )
}

function Wire({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="relative block h-0 border-t-[1.5px] border-dotted border-trs-line-2 no-underline">
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10.5px] text-trs-muted whitespace-nowrap px-1" style={{ background: 'var(--trs-canvas)' }}>{label}</span>
    </Link>
  )
}

function BridgeCard({ b }: { b: HomeBridgeData }) {
  const list = `/today?bridge=${b.key}`
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] bg-trs-green text-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,20,18,0.08)]">
      <Link href={list} className="min-w-0 no-underline text-white">
        <span className="block text-[14px] font-medium">{BRIDGE_LABEL[b.key]}</span>
        <span className="block text-[11.5px] opacity-75 tabular-nums">{b.open} open · {b.trs} for TRS{b.drafts ? ` · ${b.drafts} draft${b.drafts === 1 ? '' : 's'} ready` : ''}</span>
      </Link>
      {b.red > 0 && <Link href={`${list}&level=red`} className="font-mono text-[11px] rounded-full bg-trs-neg text-white px-2 py-[2px] no-underline whitespace-nowrap">{b.red} lapsed</Link>}
    </div>
  )
}

function More({ href, n, who }: { href: string; n: number; who: string }) {
  return (
    <Link href={href} className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[10px] border border-dashed border-trs-line-2 bg-white px-2.5 py-2 no-underline hover:border-trs-ink-2">
      <span className="grid place-items-center w-[18px] h-[18px] rounded-[5px] border border-trs-line text-[11px] text-trs-muted">+</span>
      <span className="min-w-0"><span className="block text-[13px] font-medium text-trs-ink">{n} more</span><span className="block text-[11.5px] text-trs-muted">{who}</span></span>
    </Link>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed border-trs-line px-2.5 py-2 text-[12px] text-trs-muted">{children}</div>
}

/** One case as a card. Click opens it; the menu carries the Today actions. */
function Card({ c, staff, onThread, onChanged, onError }: { c: HomeCard; staff: Staff[]; onThread: (id: string) => void; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const href = `/today/${c.id}`
  async function run(fn: () => Promise<string>) {
    setBusy(true)
    try { onChanged(await fn()) } catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  const later = (choice: LaterChoice) => run(async () => { await callApi(`/api/work/${c.id}/later`, { method: 'POST', body: { choice } }); return `${LATER_LABEL[choice]}: ${c.name}.` })
  const seen = () => run(async () => { await callApi(`/api/today/${c.id}`, { method: 'POST', body: { action: 'seen' } }); return `Read: ${c.name}.` })
  const assign = (s: Staff) => run(async () => { await callApi(`/api/work/${c.id}`, { method: 'POST', body: { action: 'assign', owner: s.email } }); return `Assigned to ${s.name}.` })
  return (
    <div className={`grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-[10px] border border-trs-line bg-white pl-2.5 pr-1 py-2 shadow-[0_1px_2px_rgba(15,20,18,0.04)] hover:border-trs-ink-2 ${busy ? 'opacity-60' : ''}`}>
      <Link href={href} className={`grid place-items-center w-[18px] h-[18px] rounded-[5px] text-[10px] no-underline ${DOT[c.level]}`} aria-label={c.level}>{c.action === 'forward' || c.action === 'send' ? '→' : '●'}</Link>
      <Link href={href} className="min-w-0 no-underline">
        <span className="block text-[13px] font-medium text-trs-ink truncate">{c.name}</span>
        <span className="block text-[11.5px] text-trs-muted truncate">{c.line}</span>
      </Link>
      <Link href={href} className="font-mono text-[11px] text-trs-muted whitespace-nowrap no-underline">{c.due && c.level === 'amber' && c.days === 0 ? `due ${c.due.slice(5)}` : `${c.days} d`}</Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Actions" className="h-[30px] w-[30px] rounded-[7px] border-0 bg-transparent text-trs-muted cursor-pointer hover:bg-trs-canvas hover:text-trs-ink text-[16px] leading-none">⋯</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => c.action === 'read' ? void seen() : router.push(href)}>{ACTION_LABEL[c.action]}</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Later</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{LATER_CHOICES.map(ch => <DropdownMenuItem key={ch} onSelect={() => void later(ch)}>{LATER_LABEL[ch]}</DropdownMenuItem>)}</DropdownMenuSubContent>
          </DropdownMenuSub>
          {c.action !== 'read' && <DropdownMenuItem onSelect={() => void seen()}>Mark read</DropdownMenuItem>}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Reassign</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{staff.map(s => <DropdownMenuItem key={s.email} disabled={s.email === c.owner_email} onSelect={() => void assign(s)}>{s.name}</DropdownMenuItem>)}</DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {c.thread_id && <DropdownMenuItem onSelect={() => onThread(c.thread_id!)}>Open thread</DropdownMenuItem>}
          {c.company_id && <DropdownMenuItem onSelect={() => router.push(`/companies/${c.company_id}`)}>Open client</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Legend() {
  const items: { level: PendingLevel; text: string }[] = [
    { level: 'red', text: 'cover lapsed or uninsured' }, { level: 'amber', text: 'money owed or deadline inside 14 days' },
    { level: 'grey', text: 'waiting, in time' }, { level: 'green', text: 'ready to send' },
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-trs-muted">
      {items.map(i => <span key={i.level} className="inline-flex items-center gap-1.5"><span className={`inline-block w-2 h-2 rounded-full ${i.level === 'red' ? 'bg-trs-neg' : i.level === 'amber' ? 'bg-trs-warn' : i.level === 'green' ? 'bg-trs-pos' : 'bg-trs-line-2'}`} />{i.text}</span>)}
    </div>
  )
}

export type { HomeBridge }
