'use client'

/**
 * Employment Benefits › Plan rules (src/lib/gb/plan-pairs.ts): which plans go together at an
 * insurer, with the brochure page that says so. One row per rule; under it, every plan of the
 * partner cover and the plan it takes, read from the house workbook, so a rule that pairs nothing
 * is visible before it is saved.
 */
import { Fragment, useEffect, useState } from 'react'
import { Btn } from '@/components/crm/primitives'
import { allowedPlans, type PlanRule } from '@/lib/gb/plan-pairs'
import { fmtDate } from '@/lib/format'

type Data = { rules: PlanRule[]; updatedBy: string | null; updatedAt: string | null; plans: Record<string, Record<string, string[]>>; products: string[]; covers: string[] }
const cell = 'h-9 w-full rounded-[7px] border border-trs-line bg-white px-2 text-[13px] text-trs-ink'

export function PlanRules() {
  const [data, setData] = useState<Data | null>(null)
  const [rules, setRules] = useState<PlanRule[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/group-benefits/plan-rules', { cache: 'no-store' }).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error ?? `Plan rules could not load (${r.status})`); return }
      setData(j); setRules(j.rules)
    }).catch(e => setMsg(e instanceof Error ? e.message : 'Plan rules could not load'))
  }, [])

  if (!data) return <p className="mt-6 text-[13.5px] text-trs-muted">{msg ?? 'Loading…'}</p>
  const set = (i: number, patch: Partial<PlanRule>) => setRules(rs => rs.map((r, k) => k === i ? { ...r, ...patch } : r))
  const changed = JSON.stringify(rules) !== JSON.stringify(data.rules)

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/group-benefits/plan-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `Not saved (${r.status})`)
      setData(d => d && { ...d, ...j }); setRules(j.rules); setMsg('Saved. Compare cover uses these rules from its next load.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Not saved') } finally { setBusy(false) }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-trs-muted">
        <span>{data.updatedAt ? `Last saved ${fmtDate(data.updatedAt)}${data.updatedBy ? ` by ${data.updatedBy.split('@')[0]}` : ''}` : 'Default rules'}</span>
        <span className="flex-1" />
        <Btn size="sm" level="secondary" onClick={() => setRules(rs => [...rs, { id: `r${Date.now()}`, product: data.products[0], cover: 'Major Medical', tiedTo: 'Hospital & Surgical', match: 'same_plan', required: true, premium: 'own', source: '' }])}>+ Add rule</Btn>
        <Btn size="sm" level="primary" loading={busy} disabled={!changed} onClick={() => void save()}>Save</Btn>
      </div>
      {msg && <p className="m-0 text-[13.5px] text-trs-ink" role="status">{msg}</p>}
      {rules.length === 0 ? <p className="m-0 text-[13.5px] text-trs-muted">No rules. Every plan can be chosen on its own.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-[13px]">
            <colgroup><col className="w-[19%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[13%]" /><col className="w-[6%]" /></colgroup>
            <thead><tr className="text-left text-[12px] text-trs-muted">
              <th className="py-2 pr-2 font-normal">Insurer</th><th className="py-2 pr-2 font-normal">Cover</th><th className="py-2 pr-2 font-normal">Goes with</th>
              <th className="py-2 pr-2 font-normal">Plan</th><th className="py-2 pr-2 font-normal">Taken</th><th className="py-2 pr-2 font-normal">Premium</th><th />
            </tr></thead>
            <tbody>
              {rules.map((r, i) => {
                const partners = data.plans[r.product]?.[r.tiedTo] ?? []
                const own = data.plans[r.product]?.[r.cover] ?? []
                return (
                  <Fragment key={r.id}>
                  <tr className="border-t border-trs-line align-top">
                    <td className="py-2 pr-2"><select aria-label={`Rule ${i + 1} insurer`} className={cell} value={r.product} onChange={e => set(i, { product: e.target.value })}>{data.products.map(p => <option key={p}>{p}</option>)}</select></td>
                    <td className="py-2 pr-2"><select aria-label={`Rule ${i + 1} cover`} className={cell} value={r.cover} onChange={e => set(i, { cover: e.target.value })}>{data.covers.map(c => <option key={c}>{c}</option>)}</select></td>
                    <td className="py-2 pr-2"><select aria-label={`Rule ${i + 1} goes with`} className={cell} value={r.tiedTo} onChange={e => set(i, { tiedTo: e.target.value })}>{data.covers.filter(c => c !== r.cover).map(c => <option key={c}>{c}</option>)}</select></td>
                    <td className="py-2 pr-2"><select aria-label={`Rule ${i + 1} plan`} className={cell} value={r.match} onChange={e => set(i, { match: e.target.value as PlanRule['match'] })}><option value="same_plan">Same plan</option><option value="any_plan">Any plan</option></select></td>
                    <td className="py-2 pr-2"><select aria-label={`Rule ${i + 1} taken`} className={cell} value={r.required ? 'yes' : 'no'} onChange={e => set(i, { required: e.target.value === 'yes' })}><option value="yes">Always</option><option value="no">Optional</option></select></td>
                    <td className="py-2 pr-2"><select aria-label={`Rule ${i + 1} premium`} className={cell} value={r.premium} onChange={e => set(i, { premium: e.target.value as PlanRule['premium'] })}><option value="own">Own rate</option><option value="included">In partner</option></select></td>
                    <td className="py-2"><Btn size="xs" level="tertiary" onClick={() => setRules(rs => rs.filter((_, k) => k !== i))}>Remove</Btn></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="pb-3 pr-4 text-[12.5px] text-trs-muted align-top">
                      {!own.length ? `${r.product} sells no ${r.cover}.` : r.match === 'any_plan' ? `Any of ${own.length} ${r.cover} plans with any ${r.tiedTo} plan`
                        : partners.map(p => { const a = allowedPlans(r, p, own); return `${p.replace(/\s*\(.*$/, '')} → ${a.length ? a.join(', ') : 'none'}` }).join(' · ')}
                    </td>
                    <td colSpan={3} className="pb-3 align-top"><input aria-label={`Rule ${i + 1} source`} className={cell} value={r.source} placeholder="Source: brochure and page" onChange={e => set(i, { source: e.target.value })} /></td>
                  </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
