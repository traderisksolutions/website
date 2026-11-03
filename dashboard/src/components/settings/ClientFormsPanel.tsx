'use client'

/**
 * The forms the agents attach when they ask a client for data: by line, retired or re-filed here,
 * and added from any attachment staff have already sent.
 */
import { useCallback, useEffect, useState } from 'react'
import { Btn, Chip } from '@/components/crm/primitives'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'

type Form = { id: string; line: string; flow: string | null; kind: string; insurer: string | null; title: string; filename: string; active: boolean; sent_count: number; last_sent: string | null; attach_on: string[] }
type Found = { id: string; filename: string; sent_at: string | null; subject: string | null; stored: boolean }
const KIND: Record<string, string> = { proposal_form: 'Proposal form', template: 'Template', brochure: 'Brochure', product_summary: 'Product summary', claim_form: 'Claim form', letter: 'Letter' }
const FLOW: Record<string, string> = { contract: 'Contract or tender', products: 'Products', event: 'Event', sme: 'SME annual', lawyers: 'Lawyers', technology: 'Technology' }
const day = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'
const sel = 'h-8 rounded-[6px] border border-trs-line bg-white px-2 text-[13px]'

export function ClientFormsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [forms, setForms] = useState<Form[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [add, setAdd] = useState<{ line: string; kind: string; flow: string }>({ line: 'general_liability', kind: 'proposal_form', flow: '' })

  const load = useCallback(async () => {
    const r = await fetch('/api/forms', { cache: 'no-store' }); const j = await r.json()
    if (!r.ok) setMsg(j.error ?? 'Could not load the forms'); else setForms(j.forms)
  }, [])
  useEffect(() => { void load() }, [load])

  async function edit(id: string, body: Record<string, unknown>) {
    const r = await fetch('/api/forms', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    const j = await r.json(); if (!r.ok) setMsg(j.error); else await load()
  }
  async function search() {
    const r = await fetch(`/api/forms?search=${encodeURIComponent(q)}`, { cache: 'no-store' }); const j = await r.json()
    setFound(r.ok ? j.found : []); if (!r.ok) setMsg(j.error)
  }
  async function addForm(f: Found) {
    const r = await fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: f.id, line: add.line, kind: add.kind, flow: add.flow || null, title: f.filename.replace(/\.[a-z0-9]+$/i, '') }) })
    const j = await r.json(); if (!r.ok) setMsg(j.error); else { setMsg(`Added ${f.filename}`); setFound([]); setQ(''); await load() }
  }

  if (!forms) return <p className="text-[13.5px] text-trs-muted">{msg ?? 'Loading…'}</p>
  const lines = Array.from(new Set(forms.map(f => f.line)))
  return (
    <div className="flex flex-col gap-6">
      {msg && <p className="m-0 text-[13.5px] text-trs-ink">{msg}</p>}
      {lines.map(line => (
        <div key={line} className="min-w-0">
          <h3 className="m-0 mb-2 text-[14px] font-semibold text-trs-ink">{productLineLabel(line)}</h3>
          <div className="overflow-x-auto"><table className="w-full text-[13px]"><tbody>
            {forms.filter(f => f.line === line).map(f => (
              <tr key={f.id} className={f.active ? '' : 'opacity-50'}>
                <td className="py-1.5 pr-3 min-w-[220px]">{f.title}<div className="text-[12px] text-trs-muted break-all">{f.filename}</div></td>
                <td className="py-1.5 pr-3 whitespace-nowrap"><Chip>{KIND[f.kind] ?? f.kind}</Chip></td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{f.flow ? <Chip tone="blue">{FLOW[f.flow] ?? f.flow}</Chip> : <span className="text-trs-muted">All requests</span>}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-trs-muted">{f.attach_on.includes('renewal') ? 'New and renewal' : 'New requests'}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-trs-muted tabular-nums">Sent {f.sent_count} · {day(f.last_sent)}</td>
                <td className="py-1.5 text-right whitespace-nowrap">{isAdmin && <Btn size="xs" level="tertiary" onClick={() => void edit(f.id, { active: !f.active })}>{f.active ? 'Retire' : 'Use again'}</Btn>}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      ))}
      {isAdmin && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[14px] font-semibold text-trs-ink">Add a form staff have sent</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search() }} placeholder="Filename, e.g. proposal form" aria-label="Filename" className={`${sel} w-[240px]`} />
            <select value={add.line} onChange={e => setAdd({ ...add, line: e.target.value })} aria-label="Line" className={sel}>{PRODUCT_LINES.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}</select>
            <select value={add.kind} onChange={e => setAdd({ ...add, kind: e.target.value })} aria-label="Kind" className={sel}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={add.flow} onChange={e => setAdd({ ...add, flow: e.target.value })} aria-label="Flow" className={sel}><option value="">All requests</option>{Object.entries(FLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <Btn size="sm" level="secondary" onClick={() => void search()}>Find</Btn>
          </div>
          {found.map(f => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="min-w-0 break-all">{f.filename}</span><span className="text-trs-muted">{day(f.sent_at)} · {f.subject?.slice(0, 60)}</span>
              <Btn size="xs" level="primary" onClick={() => void addForm(f)}>Add</Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
