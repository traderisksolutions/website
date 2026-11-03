'use client'

/**
 * An insurer's custom rates for a large employee-benefits group: typed in per product, totalled
 * against the line's census as they are typed, checked against the insurer's stated total, and
 * filed as a quote in the line's comparison (POST /api/placements/lines/[id]/custom-quote).
 * The arithmetic is src/lib/gb/custom-quote.ts, the same on screen and on save.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Field, inputCls } from '@/components/crm/primitives'
import { checkStated, customQuoteTotal, type CensusCounts, type ProductRate } from '@/lib/gb/custom-quote'
import { callApi, errText, selectCls, INK, MUTED, ERROR } from './shared'

type Method = ProductRate['method']
type Row = { product: string; method: Method; plans: Record<string, string>; rate: string; perThousand: string; totalSa: string }
type Saved = { id: string; insurer_name: string; premium_amount: number | null; custom: { rates: ProductRate[]; stated_total: number | null } | null }

const PRODUCTS = ['GHS', 'GMM', 'GP', 'SP', 'Dental', 'GTL', 'GCI', 'GPA']
const INSURERS = ['Income', 'QBE', 'Singlife', 'AIA', 'Raffles Health', 'Great Eastern', 'HSBC Life', 'Chubb', 'Zurich']
const METHOD_WORD: Record<Method, string> = {
  tier: 'Per employee, family tier (×2.5 spouse or children, ×3.5 family)',
  life: 'Per life by member type (child ×0.8)',
  per_life: 'Flat per life, dependants included',
  per_employee: 'Flat per employee',
  per_mille: 'Per S$1,000 sum assured',
}
const PRESETS: Record<string, [string, Method][]> = {
  'Income style': [['GHS', 'tier'], ['GMM', 'tier'], ['GP', 'per_employee'], ['SP', 'per_employee'], ['Dental', 'per_employee'], ['GTL', 'per_mille'], ['GPA', 'per_mille']],
  'QBE style': [['GHS', 'life'], ['GMM', 'life'], ['GP', 'per_life'], ['SP', 'per_life'], ['Dental', 'per_life']],
}

const blank = (product: string, method: Method): Row => ({ product, method, plans: {}, rate: '', perThousand: '', totalSa: '' })
const n = (s: string): number | null => { const v = Number(String(s).replace(/[,\s$]/g, '')); return s.trim() && Number.isFinite(v) && v >= 0 ? v : null }
const sgd = (v: number) => `S$${v.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The rows as rates, leaving out any row not filled in yet. */
function toRates(rows: Row[], plans: string[]): ProductRate[] {
  const out: ProductRate[] = []
  for (const r of rows) {
    if (r.method === 'tier' || r.method === 'life') {
      const rates = Object.fromEntries(plans.map(p => [p, n(r.plans[p] ?? '')]).filter(([, v]) => v != null)) as Record<string, number>
      if (Object.keys(rates).length) out.push({ product: r.product, method: r.method, rates })
    } else if (r.method === 'per_mille') {
      const a = n(r.perThousand), t = n(r.totalSa)
      if (a != null && t) out.push({ product: r.product, method: 'per_mille', ratePerThousand: a, totalSumAssured: t })
    } else {
      const a = n(r.rate)
      if (a != null) out.push({ product: r.product, method: r.method, rate: a })
    }
  }
  return out
}

function fromRates(rates: ProductRate[]): Row[] {
  return rates.map(r => r.method === 'tier' || r.method === 'life'
    ? { ...blank(r.product, r.method), plans: Object.fromEntries(Object.entries(r.rates).map(([k, v]) => [k, String(v)])) }
    : r.method === 'per_mille' ? { ...blank(r.product, r.method), perThousand: String(r.ratePerThousand), totalSa: String(r.totalSumAssured) }
    : { ...blank(r.product, r.method), rate: String(r.rate) })
}

export function CustomRatesDialog({ open, lineId, onClose, onDone }: { open: boolean; lineId: string; onClose: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState<CensusCounts | null | undefined>(undefined)
  const [saved, setSaved] = useState<Saved[]>([])
  const [insurer, setInsurer] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [stated, setStated] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = () => callApi<{ counts: CensusCounts | null; quotes: Saved[] }>(`/api/placements/lines/${lineId}/custom-quote`)
    .then(r => { setCounts(r.counts); setSaved(r.quotes) }).catch(e => { setCounts(null); setError(errText(e)) })
  useEffect(() => {
    if (!open) return
    setCounts(undefined); setInsurer(''); setRows(PRESETS['Income style'].map(([p, m]) => blank(p, m))); setStated(''); setError(null); setNotice(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineId])

  const plans = counts?.plans ?? []
  const rates = useMemo(() => toRates(rows, plans), [rows, plans])
  const result = useMemo(() => counts && rates.length ? customQuoteTotal(rates, counts) : null, [rates, counts])
  const statedN = n(stated)
  const check = result && statedN != null ? checkStated(statedN, result.total, 'Stated total') : null
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))

  async function save() {
    if (!insurer.trim()) { setError('Enter the insurer.'); return }
    if (!rates.length) { setError('Enter at least one rate.'); return }
    if (result?.missing.length) { setError(`No rate for ${result.missing.join(', ')}.`); return }
    setBusy(true); setError(null); setNotice(null)
    try {
      await callApi(`/api/placements/lines/${lineId}/custom-quote`, { method: 'POST', body: { insurer_name: insurer.trim(), stated_total: statedN, rates: rates.map(r =>
        r.method === 'per_mille' ? { product: r.product, method: r.method, rate_per_thousand: r.ratePerThousand, total_sum_assured: r.totalSumAssured }
        : r.method === 'tier' || r.method === 'life' ? { product: r.product, method: r.method, rates: r.rates }
        : { product: r.product, method: r.method, rate: r.rate }) } })
      setNotice(`${insurer.trim()} filed at ${sgd(result!.total)}. It is in the comparison.`)
      setInsurer(''); setStated(''); setRows(PRESETS['Income style'].map(([p, m]) => blank(p, m)))
      await load(); onDone()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[980px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Insurer rates</DialogTitle>
          <DialogDescription className="sr-only">Per-head or per-S$1,000 rates for a large group, totalled on the census</DialogDescription>
        </DialogHeader>
        {counts === undefined && <p className="m-0 text-[13.5px]" style={{ color: MUTED }}>Loading…</p>}
        {counts === null && !error && <p className="m-0 text-[13.5px]" style={{ color: ERROR }}>No census on this line yet. Upload the employee list first.</p>}
        {counts && (
          <div className="flex flex-col gap-4 min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ color: INK }}>
                <thead><tr style={{ color: MUTED }} className="text-left">
                  <th className="font-medium py-1 pr-3">Plan</th><th className="font-medium py-1 pr-3 text-right">Employees</th>
                  <th className="font-medium py-1 pr-3 text-right">Alone</th><th className="font-medium py-1 pr-3 text-right">+ spouse</th>
                  <th className="font-medium py-1 pr-3 text-right">+ children</th><th className="font-medium py-1 pr-3 text-right">Family</th>
                  <th className="font-medium py-1 text-right">Lives</th>
                </tr></thead>
                <tbody>{plans.map(p => { const t = counts.tiers[p], l = counts.lives[p]; return (
                  <tr key={p}><td className="py-1 pr-3">{p}</td><td className="py-1 pr-3 text-right tabular-nums">{l.employee}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{t.EO}</td><td className="py-1 pr-3 text-right tabular-nums">{t.ES}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{t.EC}</td><td className="py-1 pr-3 text-right tabular-nums">{t.EF}</td>
                    <td className="py-1 text-right tabular-nums">{l.employee + l.spouse + l.child}</td></tr>) })}</tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
              <Field label="Insurer">
                <input className={inputCls} list="custom-rate-insurers" value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="Income" />
                <datalist id="custom-rate-insurers">{INSURERS.map(i => <option key={i} value={i} />)}</datalist>
              </Field>
              <Field label="Insurer's stated total incl. GST (optional)">
                <input className={inputCls} inputMode="decimal" value={stated} onChange={e => setStated(e.target.value)} placeholder="To check its arithmetic" />
              </Field>
              <div className="flex gap-1.5 pb-0.5">
                {Object.keys(PRESETS).map(k => <Btn key={k} size="xs" level="tertiary" onClick={() => setRows(PRESETS[k].map(([p, m]) => blank(p, m)))}>{k}</Btn>)}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="grid gap-2 items-center sm:grid-cols-[110px_minmax(0,260px)_minmax(0,1fr)_auto] min-w-0">
                  <select className={selectCls} value={r.product} onChange={e => set(i, { product: e.target.value })} aria-label="Product">
                    {[...new Set([...PRODUCTS, r.product])].map(p => <option key={p}>{p}</option>)}
                  </select>
                  <select className={selectCls} value={r.method} onChange={e => set(i, { method: e.target.value as Method })} aria-label={`${r.product} priced`}>
                    {(Object.keys(METHOD_WORD) as Method[]).map(m => <option key={m} value={m}>{METHOD_WORD[m]}</option>)}
                  </select>
                  <div className="flex flex-wrap gap-1.5 min-w-0">
                    {(r.method === 'tier' || r.method === 'life') && plans.map(p => (
                      <input key={p} className={`${inputCls} w-[120px]`} inputMode="decimal" value={r.plans[p] ?? ''} placeholder={`${p}${r.method === 'tier' ? ' alone' : ' employee'}`}
                        aria-label={`${r.product} ${p} rate`} onChange={e => set(i, { plans: { ...r.plans, [p]: e.target.value } })} />
                    ))}
                    {(r.method === 'per_life' || r.method === 'per_employee') && <input className={`${inputCls} w-[140px]`} inputMode="decimal" value={r.rate} placeholder="Rate" aria-label={`${r.product} rate`} onChange={e => set(i, { rate: e.target.value })} />}
                    {r.method === 'per_mille' && <>
                      <input className={`${inputCls} w-[140px]`} inputMode="decimal" value={r.perThousand} placeholder="Per S$1,000" aria-label={`${r.product} rate per S$1,000`} onChange={e => set(i, { perThousand: e.target.value })} />
                      <input className={`${inputCls} w-[170px]`} inputMode="decimal" value={r.totalSa} placeholder="Total sum assured" aria-label={`${r.product} total sum assured`} onChange={e => set(i, { totalSa: e.target.value })} />
                    </>}
                  </div>
                  <span className="flex items-center gap-2 justify-end">
                    <span className="tabular-nums text-[13px]" style={{ color: INK }}>{result?.byProduct[r.product] != null ? sgd(result.byProduct[r.product]) : ''}</span>
                    <button type="button" aria-label={`Remove ${r.product}`} className="bg-transparent border-0 p-1 cursor-pointer rounded hover:bg-[#eceeea]" style={{ color: MUTED }} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><X size={14} /></button>
                  </span>
                </div>
              ))}
              <div><Btn size="xs" level="tertiary" onClick={() => setRows(rs => [...rs, blank('GHS', 'tier')])}><Plus size={12} /> Product</Btn></div>
            </div>

            {result && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] tabular-nums" style={{ color: INK }}>
                <span>Net {sgd(result.net)}</span><span>GST {sgd(result.gst)}</span><span className="font-semibold">Total {sgd(result.total)}</span>
                {result.missing.length > 0 && <span style={{ color: ERROR }}>No rate for {result.missing.join(', ')}</span>}
              </div>
            )}
            {check && <p className="m-0 text-[13px]" style={{ color: check.ok ? MUTED : ERROR }}>{check.ok ? `Stated total matches within S$${Math.abs(check.diff).toFixed(2)}.` : check.note}</p>}

            <div className="flex flex-wrap gap-2 items-center">
              <Btn level="primary" loading={busy} disabled={busy} onClick={() => void save()}>Add to comparison</Btn>
              {error && <span className="text-[13px]" style={{ color: ERROR }}>{error}</span>}
              {notice && <span className="text-[13px]" style={{ color: INK }}>{notice}</span>}
            </div>

            {saved.length > 0 && (
              <div className="flex flex-col gap-1 text-[13px]" style={{ color: INK }}>
                <span style={{ color: MUTED }}>Entered on this line</span>
                {saved.map(s => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="min-w-[140px]">{s.insurer_name}</span>
                    <span className="tabular-nums">{s.premium_amount != null ? sgd(s.premium_amount) : '—'}</span>
                    {s.custom && <Btn size="xs" level="tertiary" onClick={() => { setInsurer(s.insurer_name); setRows(fromRates(s.custom!.rates)); setStated(s.custom!.stated_total != null ? String(s.custom!.stated_total) : '') }}>Edit</Btn>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {counts === null && error && <p className="m-0 text-[13px]" style={{ color: ERROR }}>{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
