'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProspectsPayload } from '@/app/api/outbound/prospects/route'
import { fmtRelative } from '@/lib/crm/format'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import {
  EMAIL_STATUS_LABEL, MARKET_LABEL, MARKETS, isEnrollable, isRoleInbox, mobileForWhatsApp, toCsv, whatsappLink, whatsappMessage,
  type Market, type ProspectAccount,
} from '@/lib/outreach/prospects'
import { INK, MUTED, RULE } from './Campaigns'

/**
 * The prospect database: companies and the named people at them, imported by Claude Code into
 * prospect_accounts / prospect_contacts. One row per person. Select people and add them to a
 * campaign's review queue; nothing sends until it is approved there.
 */

type Contact = ProspectsPayload['contacts'][number]
type Quick = 'all' | 'day' | 'week' | 'sendable' | 'free'
const QUICK: { key: Quick; label: string }[] = [
  { key: 'all', label: 'All people' }, { key: 'day', label: 'Added today' }, { key: 'week', label: 'Added this week' },
  { key: 'sendable', label: 'Ready to email' }, { key: 'free', label: 'Not in a campaign' },
]
type Sort = 'added' | 'name' | 'company' | 'market' | 'email'
const DAY = 86_400_000

function inQuick(c: Contact, k: Quick, now: number): boolean {
  switch (k) {
    case 'all': return true
    case 'day': return now - Date.parse(c.created_at) < DAY
    case 'week': return now - Date.parse(c.created_at) < 7 * DAY
    case 'sendable': return isEnrollable(c)
    case 'free': return c.enrolments.every(e => e.approval === 'excluded')
  }
}

function campaignState(c: Contact): string {
  const live = c.enrolments.filter(e => e.approval !== 'excluded')
  if (!live.length) return 'None'
  const e = live[0]
  const state = e.approval === 'pending' ? 'awaiting review' : e.send === 'queued' ? 'queued' : e.send === 'unsent' ? 'included' : e.send
  return `${e.campaignName}, ${state}${live.length > 1 ? ` +${live.length - 1}` : ''}`
}

export function ProspectsView({ needle, onNotice }: { needle: string; onNotice: (s: string) => void }) {
  const [data, setData] = useState<ProspectsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quick, setQuick] = useState<Quick>('all')
  const [market, setMarket] = useState<Market | null>(null)
  const [sort, setSort] = useState<{ key: Sort; dir: 'asc' | 'desc' }>({ key: 'added', dir: 'desc' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [openAccount, setOpenAccount] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/outbound/prospects', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setData(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load prospects.') }
  }, [])
  useEffect(() => { void load() }, [load])

  const accounts = useMemo(() => new Map((data?.accounts ?? []).map(a => [a.id, a])), [data])
  // Fixed per load so the quick-filter counts and the rows agree.
  const now = useMemo(() => Date.now(), [data])
  const rows = useMemo(() => {
    if (!data) return []
    const d = sort.dir === 'asc' ? 1 : -1
    const s = (a?: string | null, b?: string | null) => (a ?? '').localeCompare(b ?? '')
    return data.contacts
      .filter(c => inQuick(c, quick, now))
      .filter(c => !market || accounts.get(c.account_id)?.market === market)
      .filter(c => !needle || [c.full_name, c.email ?? '', c.title ?? '', accounts.get(c.account_id)?.name ?? '', accounts.get(c.account_id)?.domain ?? ''].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => {
        const A = accounts.get(a.account_id), B = accounts.get(b.account_id)
        switch (sort.key) {
          case 'name': return d * s(a.full_name, b.full_name)
          case 'company': return d * s(A?.name, B?.name) || s(a.full_name, b.full_name)
          case 'market': return d * s(A?.market, B?.market) || s(A?.name, B?.name)
          case 'email': return d * s(EMAIL_STATUS_LABEL[a.email_status], EMAIL_STATUS_LABEL[b.email_status]) || s(a.full_name, b.full_name)
          default: return d * s(a.created_at, b.created_at)
        }
      })
  }, [data, quick, market, needle, sort, accounts, now])

  const companies = new Set(rows.map(r => r.account_id)).size
  const pickedRows = rows.filter(r => picked.has(r.id))
  const allPicked = rows.length > 0 && rows.every(r => picked.has(r.id))
  const filtered = quick !== 'all' || !!market || !!needle
  const onSort = (k: Sort) => setSort(x => x.key === k ? { key: k, dir: x.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'added' ? 'desc' : 'asc' })
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function exportCsv() {
    const csv = toCsv([
      ['Name', 'Title', 'Email', 'Email status', 'Email source', 'Phone', 'LinkedIn', 'Company', 'Domain', 'Market', 'Industry', 'Campaign', 'Added'],
      ...rows.map(c => { const a = accounts.get(c.account_id); return [c.full_name, c.title, c.email, EMAIL_STATUS_LABEL[c.email_status], c.email_source_url, c.phone, c.linkedin_url, a?.name, a?.domain, a?.market, a?.industry, campaignState(c), c.created_at.slice(0, 10)] }),
    ])
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a'); el.href = url; el.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`; el.click()
    URL.revokeObjectURL(url)
  }

  async function addToCampaign() {
    if (!target || !pickedRows.length) return
    setBusy(true)
    try {
      const r = await fetch('/api/outbound/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: target, contactIds: pickedRows.map(p => p.id) }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      const name = data?.campaigns.find(c => c.id === target)?.name ?? 'the campaign'
      onNotice(`${j.enrolled} added to ${name} for review${j.alreadyIn ? `; ${j.alreadyIn} already in it` : ''}${j.skipped ? `; ${j.skipped} skipped (no named email, role inbox, unchecked email or do not contact)` : ''}.`)
      setPicked(new Set()); await load()
    } catch (e) { onNotice(e instanceof Error && e.message ? e.message : 'Could not add to the campaign.') }
    finally { setBusy(false) }
  }

  if (error) return <p className="mt-8 text-[14px]" style={{ color: MUTED }}>{error} <button type="button" onClick={() => void load()} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Retry</button></p>
  if (!data) return <div className="mt-8 flex flex-col gap-3" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-[12px] bg-[#f1f3f4] animate-pulse" />)}</div>
  if (!data.ready) return <p className="m-0 mt-8 text-[15px]" style={{ color: MUTED }}>Prospect tables not created. Apply supabase/migrations/20261008_prospects.sql.</p>

  const openA = openAccount ? accounts.get(openAccount) ?? null : null
  const countMarket = (m: Market) => data.contacts.filter(c => accounts.get(c.account_id)?.market === m).length

  return (
    <div className="mt-6">
      <ul className="m-0 p-0 list-none flex items-center gap-x-5 gap-y-1 flex-wrap text-[14px]">
        {QUICK.map(k => { const on = quick === k.key; const n = data.contacts.filter(c => inQuick(c, k.key, now)).length; return <li key={k.key}><button type="button" onClick={() => setQuick(k.key)} aria-pressed={on} className={cn('bg-transparent border-0 p-0 cursor-pointer', on ? 'font-medium underline underline-offset-[6px] decoration-2' : 'hover:underline underline-offset-[6px]')} style={{ color: on ? INK : MUTED }}>{k.label} <span className="tabular-nums" style={{ color: '#80868b' }}>{n}</span></button></li> })}
      </ul>
      <ul className="m-0 mt-3 p-0 list-none flex items-center gap-x-5 gap-y-1 flex-wrap text-[13.5px]" aria-label="Market">
        {[null, ...MARKETS].map(m => { const on = market === m; const n = m ? countMarket(m) : data.contacts.length; if (m && !n) return null; return <li key={m ?? 'all'}><button type="button" onClick={() => setMarket(m)} aria-pressed={on} className={cn('bg-transparent border-0 p-0 cursor-pointer', on ? 'font-medium underline underline-offset-[6px] decoration-2' : 'hover:underline underline-offset-[6px]')} style={{ color: on ? INK : MUTED }}>{m ? MARKET_LABEL[m] : 'All markets'} <span className="tabular-nums" style={{ color: '#80868b' }}>{n}</span></button></li> })}
      </ul>

      <div className="mt-4 mb-3 flex items-center gap-3 flex-wrap text-[13.5px]" style={{ color: MUTED }}>
        <span aria-live="polite" className="tabular-nums">{rows.length} {rows.length === 1 ? 'person' : 'people'} at {companies} {companies === 1 ? 'company' : 'companies'}{picked.size ? ` · ${pickedRows.length} selected` : ''}</span>
        {filtered && <button type="button" onClick={() => { setQuick('all'); setMarket(null) }} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Clear filters</button>}
        <span className="ml-auto flex items-center gap-2 flex-wrap">
          {pickedRows.length > 0 && (
            <>
              <select value={target} onChange={e => setTarget(e.target.value)} aria-label="Campaign" className="h-9 max-w-[220px] rounded-[8px] border bg-white px-2.5 text-[13.5px]" style={{ borderColor: '#dadce0', color: INK }}>
                <option value="">Choose campaign</option>
                {data.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => void addToCampaign()} disabled={!target || busy} className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>{busy ? 'Adding…' : `Add ${pickedRows.length} for review`}</button>
            </>
          )}
          <button type="button" onClick={exportCsv} disabled={!rows.length} className="h-9 px-4 rounded-[10px] bg-white text-[13.5px] border cursor-pointer hover:bg-[#f8f9fa] disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>Export CSV</button>
        </span>
      </div>

      {data.contacts.length === 0 ? <p className="m-0 py-14 text-center text-[15px]" style={{ color: MUTED }}>No prospects yet. Import companies and named contacts into prospect_accounts and prospect_contacts.</p> : (
        <Register label="Prospects" minWidth={980} maxHeight="calc(100vh - 340px)">
          <RegisterHead>
            <RegisterTh first active={sort.key === 'name'} dir={sort.dir} onSort={() => onSort('name')}>
              <span className="inline-flex items-center gap-3"><input type="checkbox" aria-label="Select all shown" checked={allPicked} onClick={e => e.stopPropagation()} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.id)))} className="w-4 h-4 accent-[#202124]" />Person</span>
            </RegisterTh>
            <RegisterTh active={sort.key === 'company'} dir={sort.dir} onSort={() => onSort('company')}>Company</RegisterTh>
            <RegisterTh active={sort.key === 'email'} dir={sort.dir} onSort={() => onSort('email')}>Email</RegisterTh>
            <RegisterTh>Campaign</RegisterTh>
            <RegisterTh last align="right" active={sort.key === 'added'} dir={sort.dir} onSort={() => onSort('added')}>Added</RegisterTh>
          </RegisterHead>
          <tbody>
            {rows.length === 0 && <RegisterEmpty colSpan={5}>No people match.</RegisterEmpty>}
            {rows.map(c => {
              const a = accounts.get(c.account_id)
              const on = openAccount === c.account_id
              return (
                <RegisterRow key={c.id} selected={on} onClick={() => setOpenAccount(c.account_id)}>
                  <RegisterCell first selected={on} title={c.full_name}
                    primary={<span className="inline-flex items-center gap-3 min-w-0"><input type="checkbox" aria-label={`Select ${c.full_name}`} checked={picked.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggle(c.id)} className="w-4 h-4 flex-shrink-0 accent-[#202124]" /><span className="truncate">{c.full_name}</span></span>}
                    secondary={<span className="pl-7">{c.title ?? 'No title on file'}</span>} />
                  <RegisterCell primary={a?.name ?? 'Unknown'} secondary={[a?.market ? MARKET_LABEL[a.market] : null, a?.industry].filter(Boolean).join(' · ') || '—'} />
                  <RegisterCell primary={<span className="block max-w-[260px] truncate">{c.email ?? 'No email'}</span>} secondary={c.email && isRoleInbox(c.email) ? 'Role inbox, not sent' : EMAIL_STATUS_LABEL[c.email_status]} />
                  <RegisterCell><span className="block text-[14px] max-w-[240px] truncate" style={{ color: '#3c4043' }}>{campaignState(c)}</span></RegisterCell>
                  <RegisterCell last align="right" primary={fmtRelative(c.created_at)} secondary={c.source} />
                </RegisterRow>
              )
            })}
          </tbody>
        </Register>
      )}

      {openA && <AccountPanel a={openA} contacts={data.contacts.filter(c => c.account_id === openA.id)} onClose={() => setOpenAccount(null)} />}
    </div>
  )
}

function AccountPanel({ a, contacts, onClose }: { a: ProspectAccount; contacts: Contact[]; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const facts: [string, React.ReactNode][] = [
    ['Market', MARKET_LABEL[a.market]], ['Website', a.website ? <a href={a.website.startsWith('http') ? a.website : `https://${a.website}`} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>{a.domain ?? a.website}</a> : a.domain],
    ['Industry', a.industry], ['Size', a.size], ['City', a.city], ['Source', a.source_url ? <a href={a.source_url} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>{a.source}</a> : a.source], ['Added', fmtRelative(a.created_at)],
  ]
  return (
    <aside role="dialog" aria-label={a.name} className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] bg-white flex flex-col" style={{ borderLeft: `1px solid ${RULE}`, boxShadow: '-24px 0 48px -32px rgba(32,33,36,0.25)', color: INK }}>
      <div className="px-7 pt-7 flex items-start gap-3">
        <div className="min-w-0 flex-1"><h2 className="m-0 text-[22px] font-medium leading-[1.2]">{a.name}</h2><p className="m-0 mt-1.5 text-[13.5px]" style={{ color: MUTED }}>{contacts.length} {contacts.length === 1 ? 'person' : 'people'}</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 w-9 h-9 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6 flex flex-col gap-6">
        <dl className="m-0 grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
          {facts.map(([k, v]) => <div key={k} className="contents"><dt style={{ color: MUTED }}>{k}</dt><dd className="m-0 break-words min-w-0">{v || '—'}</dd></div>)}
        </dl>
        {a.notes && <p className="m-0 text-[14px] whitespace-pre-wrap" style={{ color: '#3c4043' }}>{a.notes}</p>}
        <section>
          <h3 className="m-0 mb-2 text-[14px] font-medium">People</h3>
          <ul className="m-0 p-0 list-none">
            {contacts.map(c => {
              const wa = mobileForWhatsApp(c.phone, a.market)
              return (
                <li key={c.id} className="py-3 text-[14px]" style={{ borderTop: `1px solid ${RULE}` }}>
                  <p className="m-0 font-medium">{c.full_name}</p>
                  <p className="m-0 mt-0.5" style={{ color: MUTED }}>{c.title ?? 'No title on file'}</p>
                  <dl className="m-0 mt-2 grid grid-cols-[110px_1fr] gap-y-1">
                    <dt style={{ color: MUTED }}>Email</dt>
                    <dd className="m-0 min-w-0 break-words">{c.email ? <><a href={`mailto:${c.email}`} style={{ color: INK }}>{c.email}</a> <span style={{ color: MUTED }}>· {isRoleInbox(c.email) ? 'role inbox, not sent' : EMAIL_STATUS_LABEL[c.email_status]}</span></> : '—'}</dd>
                    {c.email_source_url && <><dt style={{ color: MUTED }}>Found at</dt><dd className="m-0 min-w-0 truncate"><a href={c.email_source_url} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>{c.email_source_url.replace(/^https?:\/\//, '')}</a></dd></>}
                    <dt style={{ color: MUTED }}>Phone</dt>
                    <dd className="m-0">{c.phone ?? '—'}{wa && <> · <a href={whatsappLink(wa, whatsappMessage(c.first_name ?? c.full_name.split(' ')[0], a.name))} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>WhatsApp</a></>}</dd>
                    {c.linkedin_url && <><dt style={{ color: MUTED }}>LinkedIn</dt><dd className="m-0 min-w-0 truncate"><a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>Profile</a></dd></>}
                    <dt style={{ color: MUTED }}>Campaign</dt><dd className="m-0">{campaignState(c)}</dd>
                    {c.do_not_contact && <><dt style={{ color: MUTED }}>Status</dt><dd className="m-0">Do not contact</dd></>}
                  </dl>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </aside>
  )
}
