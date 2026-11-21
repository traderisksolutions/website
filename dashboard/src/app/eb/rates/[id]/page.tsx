'use client'

import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, Save, FileText, RefreshCw, Trash2, Pencil, X, Plus, ListChecks, MoreHorizontal, Download } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { resolveProduct } from '@/lib/gb/resolve'
import { PRODUCT_BY_CODE } from '@/lib/gb/canon'
import { VERIFICATION, verificationOf } from '@/lib/gb/verification'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm'
import { Btn, Segmented, btnClass, inputCls } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { SelectBox } from '@/components/ui/select-box'
import { Register } from '@/components/ui/register'
import { matchInsurer, type InsurerCompany } from '@/lib/insurers'
import { insurers as insurersList } from '@/app/insurers/actions'

type Rate    = { id?: string; product_code: string; member_type: string | null; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }
type Plan    = { product_code: string; plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null; co_payment: string | null }
type Benefit = { product_code: string; plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null; value_numeric: number | null; unit: string | null; notes: string | null }
type Coverage = { product_title: string | null; member_type: string | null; plan_code: string | null; item_label: string; value_numeric: number | null; value_text: string | null; unit: string | null }
type Conflict = { product_title: string; member_type: string | null; plan_code: string; band_label: string; opus: number | null; gemini: number | null; parser_seen: boolean; note?: string; judge?: { price: number | null; confidence: number; reason: string } | null }
/** One changed/added/removed benefit term between the previous approved wording and this
 *  re-extraction — see gb-diff.ts's diffBenefits (Sales Loop v2, Phase 6c). */
type WordingChange = { path: string; from: unknown; to: unknown }
type Detail  = { table: Record<string, unknown>; plans: Plan[]; rates: Rate[]; benefits: Benefit[]; coverage: Coverage[]; conflicts: Conflict[]; wordingDiff?: WordingChange[]; confidence: number | null; extractors?: Record<string, { error: string | null; rates: number }> }

// Keyed by product title + member type + plan + band (matches the judge's conflict keys).
const cKey = (c: { product_title?: string; product_code?: string; member_type: string | null; plan_code: string; band_label: string }) =>
  `${c.product_title ?? c.product_code ?? ''}|${c.member_type ?? ''}|${c.plan_code}|${c.band_label}`
const STATUS_WORD: Record<string, string> = { approved: 'Approved', in_review: 'In review', extracting: 'Extracting', draft: 'Draft', archived: 'Archived' }
const mtLabel = (m: string | null) => m === 'employee' ? 'Employee' : m === 'dependant' ? 'Dependant' : ''

// Live extraction stages for the progress checklist (server reports the current one).
const STAGES = [
  { key: 'reading',    label: 'Reading the PDF' },
  { key: 'extracting', label: 'Extracting — Opus + Gemini + text parser' },
  { key: 'judging',    label: 'Opus judge reconciling the numbers' },
  { key: 'saving',     label: 'Saving results' },
]

export default function GbReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const confirmBox = useConfirm()
  const [d, setD] = useState<Detail | null>(null)
  const [rates, setRates] = useState<Rate[]>([])
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [coverage, setCoverage] = useState<Coverage[]>([])
  const [status, setStatus] = useState<string>('')
  const [saving, setSaving] = useState<'save' | 'approve' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [meta, setMeta] = useState<Record<string, string>>({})
  // Companies → Insurers: the one list of insurers. The rate table stores which company it is.
  const [insurers, setInsurers] = useState<InsurerCompany[]>([])
  const [editing, setEditing] = useState(false)   // edit an already-approved table without re-extracting
  // Which tab is open when reading: a product label, 'benefits' or 'documents'. Review and edit
  // show every section on one page, as before, so nothing being edited is hidden.
  const [view, setView] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState('')     // serialized state at load, to detect unsaved edits

  const load = useCallback(async () => {
    const res = await fetch(`/api/group-benefits/rate-tables/${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const data: Detail = await res.json()
    setD(data); setRates(data.rates); setBenefits(data.benefits); setCoverage(data.coverage ?? [])
    setStatus(String(data.table.status ?? ''))
    const t = data.table as Record<string, unknown>
    const m = {
      insurer_id:     (t.insurer_id as string) ?? '',
      insurer_name:   (t.insurer_name as string) ?? '',
      product_code:   (t.product_code as string) ?? '',
      age_basis:      (t.age_basis as string) ?? 'next_birthday',
      plan_year:      t.plan_year != null ? String(t.plan_year) : '',
      effective_date: (t.effective_date as string) ?? '',
    }
    setMeta(m)
    setSnapshot(JSON.stringify({ r: data.rates, b: data.benefits, c: data.coverage ?? [], m }))
  }, [id])

  useEffect(() => { insurersList().then(r => setInsurers(r.ok ? r.data as typeof insurers : [])).catch(() => {}) }, [])
  // Which company this table belongs to, read from its stored name — the stored insurer_id is a
  // key into the legacy table, not a company id.
  const insurerCompanyId = meta.insurer_company_id || matchInsurer(meta.insurer_name, insurers)?.id || ''

  useEffect(() => { load() }, [load])
  // Poll while extraction is running.
  useEffect(() => {
    if (status !== 'extracting') return
    const iv = setInterval(load, 1800)
    return () => clearInterval(iv)
  }, [status, load])

  // Unsaved-changes tracking: compare current editable state to the snapshot taken at load.
  const dirty = useMemo(() => snapshot !== '' && JSON.stringify({ r: rates, b: benefits, c: coverage, m: meta }) !== snapshot, [rates, benefits, coverage, meta, snapshot])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Manual AI (13 Nov 2026): a draft table waits for Read rate table; nothing reads it on opening.
  const triggered = React.useRef(false)

  async function reExtract() {
    triggered.current = true
    setStatus('extracting')
    await fetch(`/api/group-benefits/rate-tables/${id}/extract`, { method: 'POST' }).catch(() => {})
    load()
  }
  async function del() {
    if (!(await confirmBox({ title: 'Delete this rate table?', body: 'Its extraction goes with it. This cannot be undone.', action: 'Delete', danger: true }))) return
    await fetch(`/api/group-benefits/rate-tables/${id}`, { method: 'DELETE' })
    router.push('/eb/quotations')
  }

  const conflictMap = new Map((d?.conflicts ?? []).map(c => [cKey(c), c]))

  function updateRate(idx: number, patch: Partial<Rate>) { setRates(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x))) }

  // ── Structural edits on the flat rates (matrix add/remove/rename) ──────────────
  const gm = (m: string | null) => m ?? ''                       // member-type group key
  const inGroup = (r: Rate, product: string, mt: string) => r.product_code === product && gm(r.member_type) === mt
  function renameBand(product: string, mt: string, oldB: string, newB: string) { if (!newB || newB === oldB) return; setRates(prev => prev.map(r => (inGroup(r, product, mt) && r.band_label === oldB ? { ...r, band_label: newB } : r))) }
  function renamePlan(product: string, mt: string, oldP: string, newP: string) { if (!newP || newP === oldP) return; setRates(prev => prev.map(r => (inGroup(r, product, mt) && r.plan_code === oldP ? { ...r, plan_code: newP } : r))) }
  function deleteBand(product: string, mt: string, band: string) { setRates(prev => prev.filter(r => !(inGroup(r, product, mt) && r.band_label === band))) }
  function deletePlan(product: string, mt: string, plan: string) { setRates(prev => prev.filter(r => !(inGroup(r, product, mt) && r.plan_code === plan))) }
  function addBand(product: string, mt: string, plans: string[], bands: string[]) { let n = 1, label = 'New band'; while (bands.includes(label)) label = `New band ${++n}`; setRates(prev => [...prev, ...plans.map(p => ({ product_code: product, member_type: mt || null, plan_code: p, band_label: label, age_min: null, age_max: null, premium: 0 }))]) }
  function addPlan(product: string, mt: string, bands: string[], plans: string[]) { let n = 1, code = 'New plan'; while (plans.includes(code)) code = `New plan ${++n}`; setRates(prev => [...prev, ...(bands.length ? bands : ['Up to 99']).map(b => ({ product_code: product, member_type: mt || null, plan_code: code, band_label: b, age_min: null, age_max: null, premium: 0 }))]) }
  function addProduct() { setRates(prev => [...prev, { product_code: 'New product', member_type: null, plan_code: 'Plan 1', band_label: 'Up to 99', age_min: 0, age_max: 99, premium: 0 }]) }
  function setCell(product: string, mt: string, band: string, plan: string, valStr: string) {
    const num = parseFloat(valStr)
    setRates(prev => {
      const i = prev.findIndex(r => inGroup(r, product, mt) && r.band_label === band && r.plan_code === plan)
      if (i >= 0) return prev.map((r, j) => (j === i ? { ...r, premium: isFinite(num) ? num : 0 } : r))
      if (!isFinite(num)) return prev
      return [...prev, { product_code: product, member_type: mt || null, plan_code: plan, band_label: band, age_min: null, age_max: null, premium: num }]
    })
  }
  // Coverage + benefit row edits
  function updateCoverage(i: number, patch: Partial<Coverage>) { setCoverage(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x))) }
  function addCoverage() { setCoverage(prev => [...prev, { product_title: rates[0]?.product_code ?? '', member_type: null, plan_code: null, item_label: 'New item', value_numeric: null, value_text: '', unit: null }]) }
  function addBenefit() { setBenefits(prev => [...prev, { product_code: '', plan_code: null, category: null, benefit_name: 'New benefit', value_text: '', value_numeric: null, unit: null, notes: null }]) }

  async function save(approveAfter = false) {
    if (approveAfter && (d?.conflicts?.length ?? 0) > 0 &&
        !(await confirmBox({ title: 'Approve with cells flagged?', body: `${d!.conflicts.length} cell(s) are still flagged for review.`, action: 'Approve anyway' }))) return
    setSaving(approveAfter ? 'approve' : 'save'); setMsg(null)
    try {
      const metaPayload = {
        // The server resolves the company to its key and canonical name; the browser never
        // writes a key into the legacy table directly.
        insurer_company_id: insurerCompanyId || null,
        insurer_name:   meta.insurer_name || null,
        product_code:   meta.product_code || '',
        age_basis:      meta.age_basis || 'next_birthday',
        plan_year:      meta.plan_year ? Number(meta.plan_year) : null,
        effective_date: meta.effective_date || null,
      }
      const saveRes = await fetch(`/api/group-benefits/rate-tables/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates, benefits, coverage, meta: metaPayload }),
      })
      if (!saveRes.ok) { setMsg((await saveRes.json().catch(() => ({}))).error ?? 'Save failed'); return }
      if (approveAfter) {
        const ap = await fetch(`/api/group-benefits/rate-tables/${id}/approve`, { method: 'POST' })
        if (!ap.ok) { setMsg('Approve failed'); return }
        router.push('/eb/quotations')
        return
      }
      setMsg('Saved'); setEditing(false); load()
    } finally { setSaving(null) }
  }
  async function cancelEdit() { if (dirty && !(await confirmBox({ title: 'Discard unsaved changes?', body: 'The rate table goes back to its last saved version.', action: 'Discard', danger: true }))) return; setEditing(false); setMsg(null); load() }

  if (!d) return <div className="p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const t = d.table as { insurer_name?: string; product_code?: string; source_pdf_name?: string; age_basis?: string; plan_year?: number }
  const byProduct = groupBy(rates, r => r.product_code)
  // Products in the canon's order (hospital, major medical, life, …), whatever order the insurer printed.
  const rank = (label: string) => { const c = resolveProduct(label).codes[0]; return c ? PRODUCT_BY_CODE[c].sortOrder : 999 }
  const productTabs = Array.from(byProduct.keys()).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const sources = (((d.table.rules as { sources?: { driveFileId: string; filename: string; kind: string; insurer?: string; planYear?: string | null }[] } | null)?.sources) ?? [])
  const brochure = sources.find(x => x.kind === 'brochure') ?? sources.find(x => /\.pdf$/i.test(x.filename))
  const ver = verificationOf(d.table.rules)
  const ci = 'h-auto w-full text-small px-1.5 py-0.5 border-transparent hover:border-border focus-visible:border-trs-ink'
  const btn = cn(btnClass('tertiary', 'xs'), 'px-2.5 no-underline')
  const insurerLabel = meta.insurer_name || t.insurer_name || 'Insurer'
  const editable = status === 'in_review' || editing   // cells + metadata are editable in review, or when explicitly editing an approved table
  const reading = !editable && status !== 'extracting'
  const current = view ?? productTabs[0] ?? 'benefits'
  const shows = (tab: string) => !reading || current === tab
  const tabLabel = (label: string) => { const c = resolveProduct(label).codes; return c.length ? c.map(x => PRODUCT_BY_CODE[x].abbrev).join('+') : '' }

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink" >
    <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">
      <Breadcrumbs className="mb-3" current={{ label: `Rate table · ${insurerLabel}`, href: `/eb/rates/${id}` }} fallback={{ label: 'Employment Benefits', href: '/eb/quotations' }} />

      <div className="flex items-end justify-between gap-6 mb-8 flex-wrap">
        <div className="min-w-0">
          <h1 className="m-0 text-title font-semibold leading-[1.08] truncate">{insurerLabel}</h1>
          <p className="m-0 text-body mt-2 truncate tabular-nums text-trs-muted" >
            {STATUS_WORD[status] ?? status} · {VERIFICATION[ver.status].label} · {t.plan_year ? `${t.plan_year} · ` : ''}age {t.age_basis === 'last_birthday' ? 'last' : 'next'} birthday · {byProduct.size} product{byProduct.size === 1 ? '' : 's'} · {rates.length} rates
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {dirty && <span className="text-small text-trs-muted mr-2">Unsaved changes</span>}
          {msg && !dirty && <span className={cn('text-small mr-2', /fail/i.test(msg) ? 'text-trs-neg' : 'text-trs-ink-2')}>{msg}</span>}
          {/* One document button and one menu. Status sits in the line under the name. */}
          {brochure
            ? <a href={`/api/group-benefits/sources/file/${brochure.driveFileId}`} target="_blank" rel="noopener noreferrer" className={btn}><FileText size={13} /> Brochure</a>
            : d.table.source_pdf_url ? <a href={`/api/group-benefits/rate-tables/${id}/pdf`} target="_blank" rel="noopener noreferrer" className={btn}><FileText size={13} /> PDF</a> : null}
          {status === 'draft' && <Btn size="xs" level="tertiary" onClick={() => void reExtract()} className="px-2.5"><RefreshCw size={13} /> Read rate table</Btn>}
          {!editing && status !== 'extracting' && (
            <DropdownMenu>
              <DropdownMenuTrigger className={btn} aria-label="More actions"><MoreHorizontal size={15} /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem onSelect={() => router.push(`/eb/rates/${id}/schedule`)}><ListChecks size={13} className="mr-2" /> Review benefit schedule</DropdownMenuItem>
                {status === 'approved' && <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil size={13} className="mr-2" /> Edit rates</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => reExtract()} disabled={!!saving}><RefreshCw size={13} className="mr-2" /> Re-run extraction</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => del()} className="text-trs-neg"><Trash2 size={13} className="mr-2" /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {(status === 'in_review' || editing) && (
            <>
              <span className="w-px h-5 bg-border mx-1.5" />
              {editing && <Btn size="xs" level="tertiary" onClick={cancelEdit} disabled={!!saving} className="px-2.5"><X size={13} /> Cancel</Btn>}
              <Btn size="xs" level="tertiary" onClick={() => save(false)} disabled={!!saving} className="px-2.5">
                {saving === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {editing ? 'Save changes' : 'Save'}
              </Btn>
              {status === 'in_review' && (
                <Btn size="xs" level="primary" onClick={() => save(true)} disabled={!!saving}>
                  {saving === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                </Btn>
              )}
            </>
          )}
        </div>
      </div>

      {/* One tab per cover the insurer prices, in the canon's order, then its benefits and its
          documents. Reading only: review and edit keep every section on one page. */}
      {reading && (
        <Segmented variant="tabs" className="mb-6" label="Sections" value={current} onChange={setView}
          options={[...productTabs, 'benefits', 'documents'].map(tab => ({
            value: tab,
            label: tab === 'benefits' ? 'Benefits' : tab === 'documents' ? `Documents${sources.length ? ` · ${sources.length}` : ''}` : tabLabel(tab) ? `${tab} ${tabLabel(tab)}` : tab,
          }))} />
      )}

      {reading && current === 'documents' && (
        <section className="mb-8">
          {sources.length === 0 ? (
            <p className="text-body text-trs-muted" >No documents linked.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded border border-trs-line divide-y divide-trs-field">
                {sources.map(f => (
                  <div key={f.driveFileId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-body font-medium break-words">{f.filename}</div>
                      <div className="text-small text-trs-muted" >{f.kind === 'brochure' ? 'Brochure' : f.kind === 'calculator' ? 'Insurer calculator' : f.kind === 'workbook' ? 'TRS workbook' : 'File'}{f.planYear ? ` · ${f.planYear}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/\.pdf$/i.test(f.filename) && (
                        <Btn size="xs" onClick={() => setPreviewId(previewId === f.driveFileId ? null : f.driveFileId)}>
                          {previewId === f.driveFileId ? 'Hide preview' : 'Preview'}
                        </Btn>
                      )}
                      <a href={`/api/group-benefits/sources/file/${f.driveFileId}?download=1`} className={cn(btnClass('secondary', 'xs'), 'no-underline')}><Download size={13} /> Download</a>
                    </div>
                  </div>
                ))}
              </div>
              {(previewId ?? (brochure && /\.pdf$/i.test(brochure.filename) ? brochure.driveFileId : null)) && (
                <iframe title="Document preview" src={`/api/group-benefits/sources/file/${previewId ?? brochure!.driveFileId}`}
                        className="w-full h-[78vh] min-h-[480px] rounded border border-trs-line" />
              )}
            </div>
          )}
        </section>
      )}

      {/* Extracted metadata — read from the PDF, editable in review or edit mode */}
      {editable && (
        <div className="rounded border border-border bg-white p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
            <div className="col-span-2 md:col-span-1">
              <label className="text-small text-muted-foreground/60">Insurer</label>
              <select value={insurerCompanyId} aria-label="Insurer"
                onChange={e => { const cid = e.target.value; setMeta(m => ({ ...m, insurer_company_id: cid, insurer_name: insurers.find(i => i.id === cid)?.name ?? m.insurer_name })) }}
                className={cn(inputCls, 'mt-1')}>
                <option value="">{meta.insurer_name && !insurerCompanyId ? `${meta.insurer_name} — not in Companies` : 'Choose an insurer…'}</option>
                {insurers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              {!insurerCompanyId && meta.insurer_name && (
                <Link href="/companies?kind=insurer" className="block mt-1 text-small no-underline hover:underline text-trs-muted" >Add this insurer in Companies</Link>
              )}
            </div>
            <div>
              <label className="text-small text-muted-foreground/60">Age basis</label>
              <Segmented label="Age basis" className="mt-1" value={meta.age_basis ?? 'next_birthday'} onChange={v => setMeta(m => ({ ...m, age_basis: v }))}
                options={[{ value: 'next_birthday', label: 'Next birthday' }, { value: 'last_birthday', label: 'Last birthday' }]} />
            </div>
            <div>
              <label className="text-small text-muted-foreground/60">Plan year</label>
              <Input value={meta.plan_year ?? ''} onChange={e => setMeta(m => ({ ...m, plan_year: e.target.value }))} placeholder="2026" className="mt-1" />
            </div>
            <div>
              <label className="text-small text-muted-foreground/60">Effective date</label>
              <Input type="date" value={meta.effective_date ?? ''} onChange={e => setMeta(m => ({ ...m, effective_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
        </div>
      )}

      {status === 'extracting' && (() => {
        const stage = (d.table as { extract_stage?: string | null }).extract_stage ?? 'reading'
        const cur = Math.max(0, STAGES.findIndex(s => s.key === stage))
        return (
          <div className="rounded border border-trs-line bg-trs-tint px-4 py-3.5">
            <p className="text-small text-trs-muted mb-2.5">Extracting the rate matrix — this can take up to a minute…</p>
            <div className="flex flex-col gap-1.5">
              {STAGES.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 text-small">
                  {i < cur ? <CheckCircle2 size={14} className="text-trs-ink-2 flex-shrink-0" />
                    : i === cur ? <Loader2 size={14} className="animate-spin text-trs-ink-2 flex-shrink-0" />
                    : <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />}
                  <span className={cn(i <= cur ? 'text-foreground/80 font-medium' : 'text-muted-foreground/50')}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {status !== 'extracting' && (
        <>
          {/* Per-extractor status — surfaces a failed model/key so partial data isn't silent */}
          {d.extractors && !reading && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-small">
              {/* "opus" is the stored key for the first read, kept so extraction runs recorded
                   before 2 Oct 2026 still read back. Both reads are Gemini now. */}
              {(['opus', 'gemini', 'parser'] as const).map(k => {
                const e = d.extractors![k]
                if (!e) return null
                return (
                  <span key={k} className={cn('px-2 py-0.5 rounded font-medium',
                    e.error ? 'bg-trs-field text-trs-ink-2' : 'bg-muted text-muted-foreground')}
                    title={e.error ?? ''}>
                    {({ opus: 'first read', gemini: 'second read', parser: 'text parser' } as const)[k]}: {e.error ? 'failed' : `${e.rates} cells`}
                  </span>
                )
              })}
            </div>
          )}

          {/* Conflict summary — only when there is something to verify, or while reviewing */}
          {(d.conflicts.length > 0 || !reading) && <div className={cn('flex items-center gap-2 rounded px-4 py-2.5 mb-5 text-small',
            'bg-trs-tint border border-trs-line text-trs-ink-2')}>
            {d.conflicts.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {d.confidence != null && <span className="font-semibold">{d.confidence}% agreement</span>}
            <span>· {d.conflicts.length} cell{d.conflicts.length === 1 ? '' : 's'} to verify (highlighted below){rates.length ? ` · ${rates.length} rates` : ''}</span>
          </div>}

          {/* Wording changes vs the last approved version (Sales Loop v2, Phase 6c) — only ever
              non-empty on a re-extraction, since there's nothing to diff against the first time. */}
          {(d.wordingDiff?.length ?? 0) > 0 && (
            <div className="rounded px-4 py-3 mb-5 text-small bg-trs-tint border border-trs-line text-trs-muted">
              <p className="font-semibold mb-1.5 flex items-center gap-1.5"><AlertTriangle size={14} /> {d.wordingDiff!.length} benefit term{d.wordingDiff!.length === 1 ? '' : 's'} changed since the last approved version</p>
              <ul className="flex flex-col gap-0.5">
                {d.wordingDiff!.map((w, i) => (
                  <li key={i} className="text-trs-ink-2">
                    <span className="font-medium">{w.path}</span>: {w.from == null ? <em>added</em> : w.to == null ? <em>removed</em> : <>&ldquo;{String(w.from)}&rdquo; → &ldquo;{String(w.to)}&rdquo;</>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-body">
              No rates were extracted. Check the extractor statuses above (API keys / model access), then <Btn level="tertiary" onClick={reExtract} className="h-auto p-0 border-0 font-normal text-body text-trs-ink underline align-baseline hover:bg-transparent hover:text-trs-ink">re-run</Btn>.
            </div>
          )}

          {/* Rates: a matrix (age band × plan) per product → member type */}
          {productTabs.filter(shows).map(product => [product, byProduct.get(product)!] as const).map(([product, prRates]) => (
            <section key={product} className="mb-8">
              {!reading && <h2 className="text-body font-semibold text-foreground mb-3 pb-1.5 border-b border-border">{product}</h2>}
              {Array.from(groupBy(prRates, r => r.member_type ?? '').entries()).map(([mt, mtRates]) => {
                const plans = Array.from(new Set(mtRates.map(r => r.plan_code)))
                const order = new Map<string, number>()
                for (const r of mtRates) if (!order.has(r.band_label)) order.set(r.band_label, r.age_min ?? 9999)
                const bands = Array.from(order.keys()).sort((a, b) => (order.get(a)! - order.get(b)!) || a.localeCompare(b))
                const cell = new Map<string, Rate>()
                for (const r of mtRates) cell.set(`${r.band_label}|${r.plan_code}`, r)
                return (
                  <div key={mt} className="mb-5">
                    {mtLabel(mt || null) && <p className="text-small text-trs-muted mb-2">{mtLabel(mt || null)}</p>}
                    <div className="overflow-x-auto">
                      <table className="trs-table data-table matrix-table w-full border-collapse text-small">
                        <thead className={gm(mt) === 'employee' ? 'mt-employee' : gm(mt) === 'dependant' ? 'mt-dependant' : ''}>
                          <tr>
                            <th className="text-left pl-4">Age band</th>
                            {plans.map(plan => (
                              <th key={plan} className="text-right pr-2">
                                {editable ? (
                                  <span className="inline-flex items-center gap-1 justify-center">
                                    <Input defaultValue={plan} key={plan} onBlur={e => renamePlan(product, mt, plan, e.target.value.trim())}
                                      className="h-auto w-24 text-center text-small px-2 py-1 border-transparent focus-visible:border-trs-ink !text-trs-muted" />
                                    <Btn level="tertiary" onClick={() => deletePlan(product, mt, plan)} title="Remove plan" className="h-auto w-auto p-0 border-0 bg-transparent hover:bg-transparent text-trs-subtle hover:text-trs-neg"><X size={12} /></Btn>
                                  </span>
                                ) : plan}
                              </th>
                            ))}
                            {editable && <th className="pr-2 text-right"><Btn level="tertiary" onClick={() => addPlan(product, mt, bands, plans)} title="Add plan" className="h-auto w-auto p-0 border-0 bg-transparent hover:bg-transparent text-trs-muted hover:text-trs-ink"><Plus size={13} /></Btn></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {bands.map(band => (
                            <tr key={band}>
                              <td className="pl-4 whitespace-nowrap">
                                {editable
                                  ? <Input defaultValue={band} key={band} onBlur={e => renameBand(product, mt, band, e.target.value.trim())}
                                      className="h-auto w-28 text-small px-2 py-0.5 border-transparent hover:border-border focus-visible:border-trs-ink" />
                                  : <span className="font-medium text-foreground/70">{band}</span>}
                              </td>
                              {plans.map(plan => {
                                const r = cell.get(`${band}|${plan}`)
                                const conflict = r ? conflictMap.get(cKey(r)) : undefined
                                if (!editable) return r
                                  ? <td key={plan} className="text-right pr-4 py-1"><span title={conflict ? `First read ${fmt(conflict.opus)} · second read ${fmt(conflict.gemini)}` : ''} className={cn('tabular-nums text-small', conflict ? 'rounded px-1.5 py-0.5 bg-trs-field text-trs-ink-2 font-medium' : 'text-foreground/80')}>{r.premium}</span></td>
                                  : <td key={plan} className="text-right pr-4 text-muted-foreground/25">—</td>
                                return (
                                  <td key={plan} className="text-right pr-2 py-1">
                                    <Input type="number" step="0.01" value={r ? r.premium : ''} placeholder="—"
                                      onChange={e => setCell(product, mt, band, plan, e.target.value)}
                                      title={conflict ? `First read ${fmt(conflict.opus)} · second read ${fmt(conflict.gemini)}` : ''}
                                      className={cn('h-auto w-24 text-center tabular-nums text-small px-2 py-1 focus-visible:ring-1 focus-visible:ring-primary/30',
                                        conflict ? 'border-trs-line-2 bg-trs-tint' : 'border-transparent hover:border-border')} />
                                  </td>
                                )
                              })}
                              {editable && <td className="pr-2 text-right"><Btn level="tertiary" onClick={() => deleteBand(product, mt, band)} title="Remove age band" className="h-auto w-auto p-0 border-0 bg-transparent hover:bg-transparent text-muted-foreground/30 hover:text-trs-neg"><Trash2 size={12} /></Btn></td>}
                            </tr>
                          ))}
                          {editable && (
                            <tr><td colSpan={plans.length + 2} className="pl-4">
                              <Btn level="tertiary" onClick={() => addBand(product, mt, plans, bands)} className="h-auto px-0 py-1 border-0 gap-1 text-small text-trs-muted hover:bg-transparent hover:text-trs-ink hover:opacity-80"><Plus size={12} /> Add age band</Btn>
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </section>
          ))}

          {editable && (
            <Btn level="tertiary" onClick={addProduct} className="h-auto px-0 py-0 border-0 gap-1.5 text-small text-trs-muted hover:bg-transparent hover:text-trs-ink hover:opacity-80 mb-8"><Plus size={13} /> Add product / matrix</Btn>
          )}

          {/* Coverage / sum assured */}
          {shows('benefits') && (coverage.length > 0 || editable) && (
            <section className="mb-8">
              <h2 className="text-body font-semibold text-foreground mb-3 pb-1.5 border-b border-border">Coverage &amp; sum assured</h2>
              <Register label="Coverage and sum assured" minWidth={0} maxHeight="400px" className="text-small">
                  <thead><tr>
                    <th className="pl-4 text-left">Product</th><th className="text-left">Member</th><th className="text-left">Plan</th><th className="text-left">Item</th><th className="text-right pr-4">Value</th>{editable && <th />}
                  </tr></thead>
                  <tbody>
                    {coverage.map((c, i) => editable ? (
                      <tr key={i}>
                        <td className="pl-4"><Input value={c.product_title ?? ''} onChange={e => updateCoverage(i, { product_title: e.target.value })} className={ci} /></td>
                        <td><SelectBox label="Member" value={c.member_type ?? ''} onChange={v => updateCoverage(i, { member_type: v || null })} options={[{ value: '', label: '—' }, { value: 'employee', label: 'Employee' }, { value: 'dependant', label: 'Dependant' }]} /></td>
                        <td><Input value={c.plan_code ?? ''} onChange={e => updateCoverage(i, { plan_code: e.target.value || null })} className={ci} /></td>
                        <td className="cell-left"><Input value={c.item_label} onChange={e => updateCoverage(i, { item_label: e.target.value })} className={ci} /></td>
                        <td className="text-right pr-2"><Input value={c.value_numeric != null ? String(c.value_numeric) : (c.value_text ?? '')} onChange={e => { const n = parseFloat(e.target.value.replace(/,/g, '')); updateCoverage(i, isFinite(n) && /^[\d.,]+$/.test(e.target.value) ? { value_numeric: n, value_text: null } : { value_numeric: null, value_text: e.target.value }) }} className={cn(ci, 'text-center w-32')} /></td>
                        <td className="pr-2 text-right"><Btn level="tertiary" onClick={() => setCoverage(prev => prev.filter((_, j) => j !== i))} className="h-auto w-auto p-0 border-0 bg-transparent hover:bg-transparent text-muted-foreground/30 hover:text-trs-neg"><Trash2 size={12} /></Btn></td>
                      </tr>
                    ) : (
                      <tr key={i}>
                        <td className="pl-4 whitespace-nowrap text-foreground/80">{c.product_title}</td>
                        <td className="text-muted-foreground">{c.member_type ? mtLabel(c.member_type) : '—'}</td>
                        <td className="text-muted-foreground">{c.plan_code ?? '—'}</td>
                        <td className="text-foreground/80 cell-left">{c.item_label}</td>
                        <td className="text-right pr-4 tabular-nums font-medium">{c.value_numeric != null ? c.value_numeric.toLocaleString('en-SG') : c.value_text}{c.unit ? ` ${c.unit}` : ''}</td>
                      </tr>
                    ))}
                    {editable && <tr><td colSpan={6} className="pl-4"><Btn level="tertiary" onClick={addCoverage} className="h-auto px-0 py-1 border-0 gap-1 text-small text-trs-muted hover:bg-transparent hover:text-trs-ink hover:opacity-80"><Plus size={12} /> Add coverage row</Btn></td></tr>}
                  </tbody>
              </Register>
            </section>
          )}

          {/* Benefits */}
          {shows('benefits') && (benefits.length > 0 || editable) && (
            <section className="mb-8">
              <h2 className="text-body font-semibold text-foreground mb-3 pb-1.5 border-b border-border">Benefit schedule</h2>
              <Register label="Benefit schedule" minWidth={0} maxHeight="420px" className="text-small">
                  <thead><tr>
                    <th className="pl-4 text-left">Scope</th><th className="text-left">Benefit</th><th className="text-right pr-4">Value</th>{editable && <th />}
                  </tr></thead>
                  <tbody>
                    {benefits.map((b, i) => (
                      <tr key={i}>
                        <td className="pl-4 whitespace-nowrap text-muted-foreground">
                          {editable
                            ? <Input value={b.product_code ?? ''} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, product_code: e.target.value } : x))} placeholder="product" className={cn(ci, 'w-24')} />
                            : <>{b.product_code}{b.plan_code ? ` · ${b.plan_code}` : ''}</>}
                        </td>
                        <td className="text-foreground/80 cell-left">
                          {editable
                            ? <Input value={b.benefit_name} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, benefit_name: e.target.value } : x))} className={ci} />
                            : <>{b.category ? `${b.category} — ` : ''}{b.benefit_name}</>}
                        </td>
                        <td className="text-right pr-2 py-1">
                          <Input value={b.value_text ?? ''} disabled={!editable} onChange={e => setBenefits(prev => prev.map((x, j) => j === i ? { ...x, value_text: e.target.value } : x))}
                            className={cn('h-auto w-44 text-center text-small px-2 py-1 disabled:cursor-default disabled:opacity-100', editable ? 'border-transparent hover:border-border focus-visible:border-trs-ink' : 'border-transparent')} />
                        </td>
                        {editable && <td className="pr-2 text-right"><Btn level="tertiary" onClick={() => setBenefits(prev => prev.filter((_, j) => j !== i))} className="h-auto w-auto p-0 border-0 bg-transparent hover:bg-transparent text-muted-foreground/30 hover:text-trs-neg"><Trash2 size={12} /></Btn></td>}
                      </tr>
                    ))}
                    {editable && <tr><td colSpan={4} className="pl-4"><Btn level="tertiary" onClick={addBenefit} className="h-auto px-0 py-1 border-0 gap-1 text-small text-trs-muted hover:bg-transparent hover:text-trs-ink hover:opacity-80"><Plus size={12} /> Add benefit row</Btn></td></tr>}
                  </tbody>
              </Register>
            </section>
          )}
        </>
      )}
    </div>
    </div>
  )
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of arr) { const k = key(x); (m.get(k) ?? m.set(k, []).get(k)!).push(x) }
  return m
}
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${n}`)
