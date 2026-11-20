'use client'

/**
 * Add from emails: tick one or more Inbox threads, then say for each who it is with and which
 * policies it is about. Existing, renewal and previous premium fill from the policy register when it
 * holds the client's policy for that line. Each thread becomes a placement with its lines and no
 * request drafted to insurers (dispatch: false): nothing is sent from here.
 */
import { useEffect, useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Btn, Segmented, Spinner, inputCls } from '@/components/crm/primitives'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { REQUEST_TYPES, type RequestType } from '@/lib/placement/working'
import { fmtDay } from '@/lib/format'

type Conv = { thread_id: string; subject: string | null; display_subject: string | null; snippet: string | null; match?: string | null; first_name: string | null; last_name: string | null; email: string | null; companyId: string | null; companyName: string | null; companyKind: string | null; clientCompanyId: string | null; created_at: string }
type Row = { product_line: string; request_type: RequestType | ''; existing: boolean; renewal_date: string; previous_premium: string; fromRegister: boolean }
type Block = { thread: Conv; side: 'client' | 'insurer' | ''; client: CompanyPick; rows: Row[] }

const emptyRow = (): Row => ({ product_line: '', request_type: '', existing: false, renewal_date: '', previous_premium: '', fromRegister: false })
const subjectOf = (c: Conv) => c.display_subject || c.subject || '(no subject)'
/** Every word of the search, in any order. */
const hasWords = (xs: (string | null | undefined)[], t: string) => { const text = xs.filter(Boolean).join(' ').toLowerCase(); return t.split(/\s+/).every(w => text.includes(w)) }
const senderOf = (c: Conv) => [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown sender'
const selCls = 'h-9 w-full rounded-[8px] border border-trs-line-2 bg-white px-2.5 text-13.5 text-trs-ink'

export function AddFromEmails({ company, taken, onClose, onAdded }: {
  company?: { id: string; name: string }; taken: Set<string>; onClose: () => void
  onAdded: (n: number, companyIds: string[], lineIds: string[]) => void
}) {
  const [convs, setConvs] = useState<Conv[] | null>(null)
  const [q, setQ] = useState(company?.name ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [step, setStep] = useState<1 | 2>(1)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void (async () => {
    const r = await fetch('/api/engagement/conversations', { cache: 'no-store' })
    const j = await r.json().catch(() => [])
    setConvs(Array.isArray(j) ? j : [])
  })() }, [])
  // The server's search of every thread and every email in it, fetched once typing pauses.
  const [found, setFound] = useState<Conv[]>([])
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setFound([]); return }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/engagement/conversations?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal })
        .then(r => r.json()).then(j => setFound(Array.isArray(j) ? j : [])).catch(() => {})
    }, 300)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [q])

  const all = useMemo(() => {
    // The server's matches first (they carry the email that matched), then the newest threads.
    const seen = new Set(found.map(c => c.thread_id))
    return [...found, ...(convs ?? []).filter(c => !seen.has(c.thread_id))]
  }, [convs, found])
  const foundIds = useMemo(() => new Set(found.map(c => c.thread_id)), [found])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all.filter(c => !t || foundIds.has(c.thread_id) || hasWords([subjectOf(c), c.subject, senderOf(c), c.email, c.companyName, c.snippet], t)).slice(0, 80)
  }, [all, foundIds, q])

  function next() {
    const byId = new Map(all.map(c => [c.thread_id, c]))
    setBlocks(picked.map(id => {
      const c = byId.get(id)!
      const side = c.companyKind === 'insurer' ? 'insurer' : c.companyKind ? 'client' : ''
      const client: CompanyPick = company ?? (side === 'client' && c.companyId ? { id: c.companyId, name: c.companyName ?? '' } : { id: null, name: '' })
      return { thread: c, side, client, rows: [emptyRow()] }
    }))
    setStep(2)
  }
  const setBlock = (i: number, f: (b: Block) => Block) => setBlocks(bs => bs.map((b, j) => (j === i ? f(b) : b)))
  const setRow = (i: number, k: number, f: (r: Row) => Row) => setBlock(i, b => ({ ...b, rows: b.rows.map((r, j) => (j === k ? f(r) : r)) }))

  async function prefill(i: number, k: number, product_line: string, companyId: string | null) {
    if (!companyId || !product_line) return
    const r = await fetch(`/api/placements/prefill?company_id=${companyId}&product_line=${encodeURIComponent(product_line)}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (j.existing) setRow(i, k, row => ({ ...row, existing: true, renewal_date: j.renewal_date?.slice(0, 10) ?? '', previous_premium: j.previous_premium != null ? String(j.previous_premium) : '', fromRegister: true }))
  }

  const ready = blocks.length > 0 && blocks.every(b => b.side && b.client.id && b.rows.length > 0 && b.rows.every(r => r.product_line && r.request_type))
  const count = blocks.reduce((a, b) => a + b.rows.length, 0)

  async function add() {
    setBusy(true); setError(null)
    const lineIds: string[] = [], cos: string[] = []
    try {
      for (const b of blocks) {
        const res = await fetch('/api/placements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          company_id: b.client.id, client_thread_id: b.thread.thread_id, title: subjectOf(b.thread), dispatch: false,
          lines: b.rows.map(r => ({ product_line: r.product_line, request_type: r.request_type, existing: r.existing,
            ...(r.existing && r.renewal_date ? { renewal_date: r.renewal_date } : {}),
            ...(r.existing && r.previous_premium.trim() ? { previous_premium: Number(r.previous_premium.replace(/[^0-9.]/g, '')) } : {}) })),
        }) })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error ?? 'Could not add')
        for (const l of j.lines ?? []) lineIds.push(l.id)
        cos.push(b.client.id!)
      }
      onAdded(count, cos, lineIds)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={o => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="trs-modal-overlay fixed inset-0 z-[100]" />
        <DialogPrimitive.Content aria-describedby={undefined} className="trs-modal-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100vh-48px)] w-[min(880px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[28px] bg-white px-8 pt-7 pb-6 shadow-[0_30px_80px_rgba(15,20,18,0.25)] focus:outline-none">
          <DialogPrimitive.Close aria-label="Close" className="absolute right-[18px] top-[18px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-[#e8e8ed] text-[#3a3a3c] cursor-pointer"><X size={16} /></DialogPrimitive.Close>
          <DialogPrimitive.Title className="m-0 pr-10 text-24 font-semibold tracking-[-0.02em] text-trs-ink">{step === 1 ? 'Add from emails' : 'Parties and policies'}</DialogPrimitive.Title>
          <div className="text-13.5 text-trs-muted">{step === 1 ? 'Latest Inbox threads. Tick the ones to add.' : 'One block per thread. Add a row for each policy the thread is about.'}</div>

          {step === 1 && <>
            <input className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder="Search subject, sender, company or text" aria-label="Search emails" autoFocus />
            <div className="min-h-[160px] overflow-auto -mx-2 px-2" role="list">
              {!convs && <Spinner label="Loading threads" />}
              {convs && shown.length === 0 && <div className="py-8 text-center text-14 text-trs-muted">No thread matches.</div>}
              {shown.map(c => {
                const on = taken.has(c.thread_id)
                return (
                  <label key={c.thread_id} role="listitem" className={`grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 border-b border-trs-line px-1.5 py-2.5 ${on ? 'opacity-55' : 'cursor-pointer'}`}>
                    <input type="checkbox" disabled={on} checked={picked.includes(c.thread_id)} onChange={e => setPicked(p => e.target.checked ? [...p, c.thread_id] : p.filter(x => x !== c.thread_id))} className="h-4 w-4 accent-[var(--trs-green)]" />
                    <span className="min-w-0"><span className="block text-13.5 font-medium text-trs-ink">{subjectOf(c)}</span><span className="block truncate text-12 text-trs-muted">{senderOf(c)}{c.companyName ? ` · ${c.companyName}` : ''}</span>{c.match && q.trim() && <span className="block truncate text-12 text-trs-subtle">Matched: {c.match}</span>}</span>
                    <span className="whitespace-nowrap text-12 text-trs-muted">{on ? 'On list' : fmtDay(c.created_at)}</span>
                  </label>
                )
              })}
            </div>
            <div className="flex items-center justify-between pt-2"><span className="text-13 text-trs-muted">{picked.length} selected</span><Btn level="primary" disabled={!picked.length} onClick={next}>Next</Btn></div>
          </>}

          {step === 2 && <>
            <div className="overflow-auto -mx-2 px-2">
              {blocks.map((b, i) => (
                <div key={b.thread.thread_id} className="flex flex-col gap-2 border-b border-trs-line py-3.5">
                  <div className="text-13.5 font-medium text-trs-ink">{subjectOf(b.thread)}</div>
                  <div className="text-12 text-trs-muted">{senderOf(b.thread)}{b.thread.companyName ? ` · ${b.thread.companyName}` : ''}</div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-12.5 text-trs-muted">Thread is with</span>
                    <Segmented<'client' | 'insurer'> value={(b.side || 'client') as 'client' | 'insurer'} label="Thread is with" options={[{ value: 'client', label: 'Client' }, { value: 'insurer', label: 'Insurer' }]}
                      onChange={v => setBlock(i, x => ({ ...x, side: v, client: v === 'client' && x.thread.companyKind !== 'insurer' && x.thread.companyId ? { id: x.thread.companyId, name: x.thread.companyName ?? '' } : company ?? { id: null, name: '' } }))} />
                  </div>
                  <div className="max-w-[420px]"><CompanyField label="Client" value={b.client} listId={`client-${i}`} onChange={v => setBlock(i, x => ({ ...x, client: v }))} /></div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-13">
                      <thead><tr className="text-left text-12 text-trs-muted"><th className="pb-1.5 pr-2 font-medium">Policy</th><th className="pb-1.5 pr-2 font-medium">Type</th><th className="pb-1.5 pr-2 font-medium">Existing</th><th className="pb-1.5 pr-2 font-medium">Renewal date</th><th className="pb-1.5 pr-2 font-medium">Previous premium S$</th><th /></tr></thead>
                      <tbody>{b.rows.map((r, k) => (
                        <tr key={k} className="align-top">
                          <td className="py-1 pr-2"><select aria-label="Policy" className={selCls} value={r.product_line} onChange={e => { const v = e.target.value; setRow(i, k, x => ({ ...x, product_line: v, fromRegister: false })); void prefill(i, k, v, b.client.id) }}>
                            <option value="">Choose</option>{PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}</select></td>
                          <td className="py-1 pr-2"><select aria-label="Type" className={selCls} value={r.request_type} onChange={e => setRow(i, k, x => ({ ...x, request_type: e.target.value as RequestType }))}>
                            <option value="">Choose</option>{REQUEST_TYPES.map(([v, w]) => <option key={v} value={v}>{w}</option>)}</select></td>
                          <td className="py-1 pr-2 whitespace-nowrap"><Segmented<'yes' | 'no'> value={r.existing === false ? 'no' : 'yes'} label="Existing" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                            onChange={v => setRow(i, k, x => ({ ...x, existing: v === 'yes', ...(v === 'no' ? { renewal_date: '', previous_premium: '', fromRegister: false } : {}) }))} />
                            {r.fromRegister && <span className="block text-12 text-trs-pos">From register</span>}</td>
                          <td className="py-1 pr-2">{r.existing ? <input type="date" aria-label="Renewal date" className={inputCls} value={r.renewal_date} onChange={e => setRow(i, k, x => ({ ...x, renewal_date: e.target.value, fromRegister: false }))} /> : <span className="text-trs-muted">—</span>}</td>
                          <td className="py-1 pr-2">{r.existing ? <input inputMode="decimal" aria-label="Previous premium" className={inputCls} value={r.previous_premium} onChange={e => setRow(i, k, x => ({ ...x, previous_premium: e.target.value, fromRegister: false }))} /> : <span className="text-trs-muted">—</span>}</td>
                          <td className="py-1">{b.rows.length > 1 && <button type="button" aria-label="Remove row" onClick={() => setBlock(i, x => ({ ...x, rows: x.rows.filter((_, j) => j !== k) }))} className="mt-1.5 h-[26px] w-[26px] rounded-full border-0 bg-transparent text-trs-subtle cursor-pointer hover:bg-trs-field">×</button>}</td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => setBlock(i, x => ({ ...x, rows: [...x.rows, emptyRow()] }))} className="self-start border-0 bg-transparent p-0 text-12.5 text-trs-muted underline cursor-pointer">+ Add policy</button>
                </div>
              ))}
            </div>
            {error && <div className="text-13 text-trs-neg">{error}</div>}
            <div className="flex items-center justify-between pt-2"><Btn onClick={() => setStep(1)}>Back</Btn><Btn level="primary" loading={busy} disabled={!ready} onClick={() => void add()}>Add {count} to the list</Btn></div>
          </>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
