'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { UploadCloud, Plus, Download, Send, Loader2, FolderOpen, Pencil, Trash2, PlusCircle, X, ArrowUp, ArrowDown, ArrowUpDown, ListFilter } from 'lucide-react'
import { AppSplitLayout, AppMainPanel, AppPageHeader, AppPageBody } from '@/components/app-shell'
import { DataTableToolbar, DataTableReset } from '@/components/data-table/toolbar'
import { DetailSection, DetailField } from '@/components/detail-section'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { SendDocumentsModal, type SendableAttachment } from '@/components/debit-notes/SendDocumentsModal'
import { Register, RegisterHead, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { cn } from '@/lib/utils'

const INK = '#202124'
const MUTED = '#5f6368'
const BODY = '#3c4043'

type Row = {
  id: string; debit_note_no: string; issue_date: string; payment_due_date: string | null
  currency: string; gross_amount: number; net_amount: number; commission: number | null
  paid_amount: number; status: 'unpaid' | 'partially_paid' | 'paid'; insurer: string | null
  source: string; company_id: string; policy_id: string
  companies: { name: string } | null
  policies: { policy_number: string | null; broker: string | null; class_of_insurance: string | null; end_date: string | null } | null
}

const fmt = (n: number, c: string) => `${c} ${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2 })}`
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const STATUS_OPTIONS: PayStatus[] = ['unpaid', 'partially_paid', 'paid']
const STATUS_LABEL: Record<PayStatus, string> = { unpaid: 'Unpaid', partially_paid: 'Partially paid', paid: 'Paid' }

type ColKey = 'company' | 'policyType' | 'policyNo' | 'insurer' | 'dnNo' | 'policyDue' | 'amount' | 'commission' | 'status'
type SortDir = 'asc' | 'desc'

interface Column {
  key:     ColKey
  label:   string
  align?:  'right'
  type:    'text' | 'status'
  /** Sort value — number for numeric columns (commission/amount), string otherwise. */
  value:   (r: Row) => string | number
  /** Formatted display text, reused as the substring the text filter matches against. */
  display: (r: Row) => string
}

// Company is now its own sortable/filterable column (was the collapsible group header before
// the table was flattened) rather than a special case.
const COLUMNS: Column[] = [
  { key: 'company',    label: 'Company',     type: 'text', value: r => r.companies?.name ?? '', display: r => r.companies?.name ?? '—' },
  { key: 'policyType', label: 'Policy type', type: 'text', value: r => r.policies?.class_of_insurance ?? '', display: r => r.policies?.class_of_insurance || '—' },
  { key: 'policyNo',   label: 'Policy #',    type: 'text', value: r => r.policies?.policy_number ?? '', display: r => r.policies?.policy_number || '—' },
  { key: 'insurer',    label: 'Insurer',     type: 'text', value: r => r.insurer ?? '', display: r => r.insurer ?? '—' },
  { key: 'dnNo',       label: 'DN #',        type: 'text', value: r => r.debit_note_no ?? '', display: r => r.debit_note_no },
  { key: 'policyDue',  label: 'Policy due',  type: 'text', value: r => r.policies?.end_date ?? '', display: r => fmtDate(r.policies?.end_date ?? null) },
  { key: 'amount',     label: 'Amount',      type: 'text', align: 'right', value: r => r.gross_amount, display: r => fmt(r.gross_amount, r.currency) },
  // null sorts to the bottom ascending / top descending, same convention as "no value" elsewhere.
  { key: 'commission', label: 'Commission',  type: 'text', align: 'right', value: r => r.commission ?? -Infinity, display: r => r.commission != null ? fmt(r.commission, r.currency) : '—' },
  { key: 'status',     label: 'Status',      type: 'status', value: r => r.status, display: r => STATUS_LABEL[r.status] },
]

// Policy type is shown as the Company cell's second line, so it has no header of its own;
// its text filter lives in the Company header's popover. Sorting and filtering still run over
// every column in COLUMNS.
const HEADER_COLUMNS = COLUMNS.filter(c => c.key !== 'policyType')

/** A text filter field inside a column's popover. */
function FilterInput({ label, value, onChange, autoFocus }: { label: string; value?: string; onChange?: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus={autoFocus}
        value={value ?? ''}
        onChange={e => onChange?.(e.target.value)}
        placeholder={`Filter ${label.toLowerCase()}`}
        aria-label={`Filter ${label.toLowerCase()}`}
        className="flex-1 min-w-0 h-9 rounded-[8px] border bg-white px-2.5 text-[13px] outline-none focus:border-[#202124]"
        style={{ borderColor: '#dadce0', color: INK }}
      />
      {value && (
        <button type="button" onClick={() => onChange?.('')} aria-label={`Clear ${label.toLowerCase()} filter`} className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] flex-shrink-0" style={{ color: MUTED }}><X size={12} /></button>
      )}
    </div>
  )
}

/**
 * A register header cell that sorts and filters. Same markup as RegisterTh (sticky first column,
 * 13px muted label, arrow on the active sort) with the filter popover trigger beside the label.
 * The popover trigger cannot live inside RegisterTh's sort button, so the th is rendered here.
 */
function ColumnHeader({
  col, sortKey, sortDir, onSort, filterValue, onFilterChange, statusFilter, onStatusFilterChange, first, last, extraFilter,
}: {
  col: Column
  sortKey: ColKey | null
  sortDir: SortDir
  onSort: (key: ColKey) => void
  filterValue?: string
  onFilterChange?: (v: string) => void
  statusFilter?: Set<PayStatus>
  onStatusFilterChange?: (s: Set<PayStatus>) => void
  first?: boolean
  last?: boolean
  /** A second text filter shown in the same popover (Company carries the policy type filter). */
  extraFilter?: { label: string; value?: string; onChange: (v: string) => void }
}) {
  const [open, setOpen] = useState(false)
  const active   = (col.type === 'status' ? (statusFilter?.size ?? 0) > 0 : !!filterValue?.trim()) || !!extraFilter?.value?.trim()
  const isSorted = sortKey === col.key
  const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
  const right = col.align === 'right'

  return (
    <th scope="col" aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('py-0 font-normal whitespace-nowrap', right ? 'text-right' : 'text-left', first ? 'sticky left-0 z-30 bg-white pl-6 pr-4 shadow-[inset_-1px_0_0_#e8eaed]' : 'px-4', last && 'pr-6')}>
      <span className={cn('group inline-flex items-center gap-1 h-11', right && 'flex-row-reverse')}>
        <button type="button" onClick={() => onSort(col.key)} title={`Sort by ${col.label.toLowerCase()}`}
          className={cn('inline-flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer text-[13px] whitespace-nowrap', right && 'flex-row-reverse', isSorted && 'font-medium')} style={{ color: isSorted ? INK : MUTED }}>
          {col.label}
          <SortIcon size={13} className={cn(isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} aria-hidden />
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" title={`Filter ${col.label.toLowerCase()}`} aria-label={`Filter ${col.label.toLowerCase()}`}
              className={cn('w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60 focus-visible:opacity-100')}
              style={{ color: active ? INK : MUTED }}>
              <ListFilter size={13} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2.5 rounded-[12px]" align={right ? 'end' : 'start'} style={{ border: '1px solid #e8eaed' }}>
            {col.type === 'status' ? (
              <div className="flex flex-col gap-0.5">
                {STATUS_OPTIONS.map(s => (
                  <label key={s} className="flex items-center gap-2 text-[13.5px] px-2 py-1.5 rounded-[8px] hover:bg-[#f8f9fa] cursor-pointer" style={{ color: INK }}>
                    <input
                      type="checkbox"
                      checked={statusFilter?.has(s) ?? false}
                      onChange={e => {
                        const next = new Set(statusFilter)
                        if (e.target.checked) next.add(s); else next.delete(s)
                        onStatusFilterChange?.(next)
                      }}
                    />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
                {(statusFilter?.size ?? 0) > 0 && (
                  <button type="button" onClick={() => onStatusFilterChange?.(new Set())} className="text-[13px] mt-1 text-left px-2 py-1 bg-transparent border-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Clear</button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <FilterInput label={col.label} value={filterValue} onChange={onFilterChange} autoFocus />
                {extraFilter && <FilterInput label={extraFilter.label} value={extraFilter.value} onChange={extraFilter.onChange} />}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </span>
    </th>
  )
}

export default function DebitNotesPage() {
  return (
    <Suspense>
      <DebitNotesContent />
    </Suspense>
  )
}

function DebitNotesContent() {
  const search = useSearchParams()
  const companyId = search.get('company_id')

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(search.get('open'))

  const [sortKey, setSortKey] = useState<ColKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [colFilters, setColFilters] = useState<Partial<Record<ColKey, string>>>({})
  const [statusFilter, setStatusFilter] = useState<Set<PayStatus>>(new Set())

  function load() {
    setLoading(true)
    fetch(`/api/debit-notes${companyId ? `?company_id=${companyId}` : ''}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: Row[]) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }
  useEffect(load, [companyId])

  function toggleSort(key: ColKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return }
    setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
  }

  const activeFilterCount = Object.values(colFilters).filter(v => v?.trim()).length + (statusFilter.size > 0 ? 1 : 0)

  function resetAll() {
    setColFilters({}); setStatusFilter(new Set()); setSortKey(null); setSortDir('asc')
  }

  const filtered = useMemo(() => rows.filter(r => {
    for (const col of COLUMNS) {
      if (col.key === 'status') {
        if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false
        continue
      }
      const f = colFilters[col.key]
      if (f?.trim() && !col.display(r).toLowerCase().includes(f.trim().toLowerCase())) return false
    }
    return true
  }), [rows, colFilters, statusFilter])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = COLUMNS.find(c => c.key === sortKey)!
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = col.value(a), vb = col.value(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [filtered, sortKey, sortDir])

  return (
    <AppSplitLayout>
      <AppMainPanel>
        <div className="px-8 pt-10 pb-6" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08] text-[#202124]">Debit Notes</h1>
              <p className="m-0 mt-2 text-[15px] text-[#5f6368]">{loading ? 'Loading…' : `${rows.length} debit note${rows.length === 1 ? '' : 's'}`}{companyId ? ' for this company' : ''}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <a href="https://drive.google.com/drive/folders/1fNWSYQdZwhkz2A4APmif41PLNwNWNv9r" target="_blank" rel="noreferrer" className="h-12 px-5 rounded-[12px] bg-white text-[15px] border no-underline inline-flex items-center gap-2 hover:bg-[#f8f9fa] text-[#202124]" style={{ borderColor: '#dadce0' }}><FolderOpen size={15} /> Drive folder</a>
              <Link href="/debit-notes/historical" className="h-12 px-5 rounded-[12px] bg-white text-[15px] border no-underline inline-flex items-center gap-2 hover:bg-[#f8f9fa] text-[#202124]" style={{ borderColor: '#dadce0' }}><UploadCloud size={15} /> Import historical</Link>
              <Link href="/debit-notes/new" className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium no-underline inline-flex items-center gap-2 hover:opacity-90" style={{ background: '#202124' }}><Plus size={15} /> New debit note</Link>
            </div>
          </div>
        </div>
        {(activeFilterCount > 0 || sortKey) && (
          <DataTableToolbar>
            <span className="text-[13px]" style={{ color: MUTED }}>
              {sorted.length} of {rows.length} debit note{rows.length !== 1 ? 's' : ''}
              {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''}`}
              {sortKey && ` · sorted by ${COLUMNS.find(c => c.key === sortKey)?.label.toLowerCase()} (${sortDir === 'asc' ? 'ascending' : 'descending'})`}
            </span>
            <DataTableReset onReset={resetAll} />
          </DataTableToolbar>
        )}
        <AppPageBody padded={false}>
          <div className="px-8 pb-10">
            <Register label="Debit notes" minWidth={1080} maxHeight="calc(100vh - 260px)">
              <RegisterHead>
                {HEADER_COLUMNS.map((col, i) => (
                  <ColumnHeader
                    key={col.key}
                    col={col}
                    first={i === 0}
                    last={i === HEADER_COLUMNS.length - 1}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    filterValue={colFilters[col.key]}
                    onFilterChange={v => setColFilters(f => ({ ...f, [col.key]: v }))}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    extraFilter={col.key === 'company' ? { label: 'Policy type', value: colFilters.policyType, onChange: v => setColFilters(f => ({ ...f, policyType: v })) } : undefined}
                  />
                ))}
              </RegisterHead>
              <tbody>
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e8eaed' }}><td colSpan={HEADER_COLUMNS.length} className="pl-6 pr-6 h-14"><div className="h-3.5 w-[70%] rounded bg-[#f1f3f4] animate-pulse" /></td></tr>
                ))}
                {!loading && sorted.length === 0 && (
                  <RegisterEmpty colSpan={HEADER_COLUMNS.length}>{rows.length === 0 ? 'No debit notes yet.' : 'No debit notes match these filters.'}</RegisterEmpty>
                )}
                {!loading && sorted.map(r => (
                  <RegisterRow key={r.id} onClick={() => setOpenId(r.id)}>
                    <RegisterCell first title={r.companies?.name ?? undefined} primary={r.companies?.name ?? '—'} secondary={r.policies?.class_of_insurance || 'No policy type'} />
                    <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: BODY }}>{r.policies?.policy_number || '—'}</span></RegisterCell>
                    <RegisterCell className="max-w-[220px]"><span className="block truncate text-[14px]" style={{ color: BODY }}>{r.insurer ?? '—'}</span></RegisterCell>
                    <RegisterCell><span className="text-[14px] tabular-nums" style={{ color: BODY }}>{r.debit_note_no}</span></RegisterCell>
                    <RegisterCell primary={fmtDate(r.policies?.end_date ?? null)} />
                    <RegisterCell align="right" primary={<span className="font-medium">{fmt(r.gross_amount, r.currency)}</span>} secondary={r.currency} />
                    <RegisterCell align="right" primary={r.commission != null ? fmt(r.commission, r.currency) : '—'} />
                    <RegisterCell last><span className="text-[14px]" style={{ color: BODY }}>{STATUS_LABEL[r.status]}</span></RegisterCell>
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          </div>
        </AppPageBody>
      </AppMainPanel>

      {openId && <DebitNoteDrawer id={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </AppSplitLayout>
  )
}

type AttachmentFile = SendableAttachment
type PayStatus = 'unpaid' | 'partially_paid' | 'paid'
type EventType = 'new_business' | 'renewal' | 'endorsement'

type DetailPolicy = {
  policy_number: string | null; class_of_insurance: string | null; cover_note_no: string | null
  description: string | null; start_date: string | null; end_date: string | null; broker: string | null
}

type Detail = {
  id: string; debit_note_no: string; issue_date: string; payment_due_date: string | null
  currency: string; gross_amount: number; net_amount: number
  insurer: string | null; company_id: string; policy_id: string
  line_items: { description: string; amount: number }[]
  gst_amount: number; fee_rebate: number
  paid_amount: number; status: PayStatus
  paid_direct_amount: number; paid_direct_status: PayStatus
  pay_direct_to_insurer: boolean; pay_to_trs_ops: boolean
  commission: number | null; commission_rate: number | null
  event_type: EventType; endorsement_effective_date: string | null
  attachment_files: AttachmentFile[]
  drive_folder_url: string | null
  companies: { name: string } | null
  policies: DetailPolicy | null
  contacts: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
  pdf_storage_url: string | null
}

type EditForm = {
  debitNoteNo: string
  currency: string; issueDate: string; paymentDueDate: string; insurer: string
  lineItems: { description: string; amount: number }[]
  gstAmount: number; feeRebate: number; commission: number; commissionRate: number
  policyNumber: string; classOfInsurance: string; coverNoteNo: string; description: string
  startDate: string; endDate: string; broker: string
  eventType: EventType; endorsementEffectiveDate: string
}

function toEditForm(d: Detail): EditForm {
  return {
    debitNoteNo: d.debit_note_no ?? '',
    currency: d.currency, issueDate: d.issue_date ?? '', paymentDueDate: d.payment_due_date ?? '', insurer: d.insurer ?? '',
    lineItems: d.line_items?.length ? d.line_items.map(l => ({ ...l })) : [{ description: '', amount: 0 }],
    gstAmount: d.gst_amount ?? 0, feeRebate: d.fee_rebate ?? 0, commission: d.commission ?? 0, commissionRate: d.commission_rate ?? 0,
    policyNumber: d.policies?.policy_number ?? '', classOfInsurance: d.policies?.class_of_insurance ?? '', coverNoteNo: d.policies?.cover_note_no ?? '',
    description: d.policies?.description ?? '', startDate: d.policies?.start_date ?? '', endDate: d.policies?.end_date ?? '', broker: d.policies?.broker ?? '',
    eventType: d.event_type ?? 'new_business', endorsementEffectiveDate: d.endorsement_effective_date ?? '',
  }
}

const inputCls = 'text-[12.5px] border border-border rounded-md px-2 py-1 w-full'

function DebitNoteDrawer({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)

  const [feeRebateEnabled, setFeeRebateEnabled] = useState(false)
  const [payDirectToInsurer, setPayDirectToInsurer] = useState(false)
  const [payToTrsOps, setPayToTrsOps] = useState(false)
  const [paidDirectAmount, setPaidDirectAmount] = useState(0)
  const [paidDirectStatus, setPaidDirectStatus] = useState<PayStatus>('unpaid')
  const [paidAmount, setPaidAmount] = useState(0)
  const [status, setStatus] = useState<PayStatus>('unpaid')

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendPickerOpen, setSendPickerOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/debit-notes/${id}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((d: Detail | null) => {
      if (!d) return
      setDetail(d)
      setPaidAmount(d.paid_amount ?? 0); setStatus(d.status)
      setPaidDirectAmount(d.paid_direct_amount ?? 0); setPaidDirectStatus(d.paid_direct_status ?? 'unpaid')
      setPayDirectToInsurer(!!d.pay_direct_to_insurer); setPayToTrsOps(!!d.pay_to_trs_ops)
    })
  }, [id])

  function startEditing() {
    if (!detail) return
    setForm(toEditForm(detail))
    setFeeRebateEnabled((detail.fee_rebate ?? 0) > 0)
    setEditing(true)
  }

  function updateLineItem(i: number, patch: Partial<{ description: string; amount: number }>) {
    setForm(f => f && { ...f, lineItems: f.lineItems.map((l, idx) => idx === i ? { ...l, ...patch } : l) })
  }
  function addLineItem() {
    setForm(f => f && { ...f, lineItems: [...f.lineItems, { description: '', amount: 0 }] })
  }
  function removeLineItem(i: number) {
    setForm(f => f && { ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) })
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        paidAmount, status, paidDirectAmount, paidDirectStatus,
        payDirectToInsurer, payToTrsOps,
      }
      if (editing && form) {
        Object.assign(body, {
          debitNoteNo: form.debitNoteNo.trim(),
          currency: form.currency, issueDate: form.issueDate, paymentDueDate: form.paymentDueDate || null,
          insurer: form.insurer, lineItems: form.lineItems.filter(l => l.description || l.amount),
          gstAmount: form.gstAmount, feeRebate: feeRebateEnabled ? form.feeRebate : 0, commission: form.commission, commissionRate: form.commissionRate,
          eventType: form.eventType, endorsementEffectiveDate: form.eventType === 'endorsement' ? (form.endorsementEffectiveDate || null) : null,
          policy: {
            policyNumber: form.policyNumber || null, classOfInsurance: form.classOfInsurance || null,
            coverNoteNo: form.coverNoteNo || null, description: form.description || null,
            startDate: form.startDate || null, endDate: form.endDate || null, broker: form.broker || null,
          },
        })
      }
      const res = await fetch(`/api/debit-notes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save')
      onSaved(); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') } finally { setSaving(false) }
  }

  async function del() {
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/debit-notes/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not delete')
      onSaved(); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); setDeleting(false) }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            {editing && form ? (
              <DialogTitle asChild>
                <input value={form.debitNoteNo} onChange={e => setForm(f => f && { ...f, debitNoteNo: e.target.value })}
                  placeholder="Debit note no." className="text-[18px] font-semibold leading-none border border-border rounded-md px-2 py-1 w-[220px]" />
              </DialogTitle>
            ) : (
              <DialogTitle>{detail?.debit_note_no ?? 'Loading…'}</DialogTitle>
            )}
            {detail && !editing && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={startEditing}><Pencil size={12} className="mr-1.5" /> Edit</Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="text-[#3c4043] hover:text-[#3c4043] border-[#e8eaed] hover:bg-[#f1f3f4]">
                  <Trash2 size={12} className="mr-1.5" /> Delete
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        {!detail ? (
          <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : confirmDelete ? (
          <div className="px-4 py-4">
            <p className="text-[13px] mb-1">Delete debit note {detail.debit_note_no}?</p>
            <p className="text-[11.5px] text-muted-foreground mb-4">This removes this debit note and its generated PDF. If no other debit notes are linked to its policy, the policy is removed too — the company and its contacts are never affected. This cannot be undone.</p>
            {error && <p className="text-[11.5px] text-[#3c4043] mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
              <Button size="sm" onClick={del} disabled={deleting} className="bg-white text-[#c5221f] border border-[#dadce0] hover:bg-[#f8f9fa]">
                {deleting ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Trash2 size={13} className="mr-1.5" />} Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <DetailSection label="Client">
              <DetailField label="Company"><span className="">{detail.companies?.name ?? '—'}</span></DetailField>
              {!editing && detail.event_type === 'endorsement' && (
                <div className="mb-3 rounded-md border border-[#e8eaed] bg-[#f1f3f4]/60 px-2.5 py-1.5">
                  <p className="text-[12.5px] font-medium text-[#3c4043]">Mid-term endorsement</p>
                  <p className="text-[11.5px] text-[#3c4043]">Effective {fmtDate(detail.endorsement_effective_date)}</p>
                </div>
              )}
              {editing && form ? (
                <>
                  <div className="rounded-md border border-[--border-subtle] p-2.5 mb-3 flex items-center gap-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground flex-1">Debit note type
                      <select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value as EventType })} className={inputCls}>
                        <option value="new_business">New business</option>
                        <option value="renewal">Renewal</option>
                        <option value="endorsement">Mid-term endorsement</option>
                      </select>
                    </label>
                    {form.eventType === 'endorsement' && (
                      <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground flex-1">Effective date
                        <input type="date" value={form.endorsementEffectiveDate} onChange={e => setForm({ ...form, endorsementEffectiveDate: e.target.value })} className={inputCls} />
                      </label>
                    )}
                  </div>
                  {/* Row 1 — reference numbers */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Policy number
                      <input value={form.policyNumber} onChange={e => setForm({ ...form, policyNumber: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Cover note no.
                      <input value={form.coverNoteNo} onChange={e => setForm({ ...form, coverNoteNo: e.target.value })} className={inputCls} />
                    </label>
                  </div>
                  {/* Row 2 — insurer, class & broker */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Insurer
                      <input value={form.insurer} onChange={e => setForm({ ...form, insurer: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Class of insurance
                      <input value={form.classOfInsurance} onChange={e => setForm({ ...form, classOfInsurance: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Broker
                      <input value={form.broker} onChange={e => setForm({ ...form, broker: e.target.value })} className={inputCls} />
                    </label>
                  </div>
                  {/* Row 3 — dates (period + billing) — wraps to 2×2 in this narrower dialog */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Period start
                      <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Period end
                      <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Issue date
                      <input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Payment due date
                      <input type="date" value={form.paymentDueDate} onChange={e => setForm({ ...form, paymentDueDate: e.target.value })} className={inputCls} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Description
                    <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} />
                  </label>
                </>
              ) : (
                <>
                  <DetailField label="Policy">{detail.policies?.policy_number || '—'} · {detail.policies?.class_of_insurance || '—'}</DetailField>
                  <DetailField label="Cover note no.">{detail.policies?.cover_note_no || '—'}</DetailField>
                  <DetailField label="Period (renewal)">{fmtDate(detail.policies?.start_date ?? null)} – {fmtDate(detail.policies?.end_date ?? null)}</DetailField>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Issue date">{fmtDate(detail.issue_date)}</DetailField>
                    <DetailField label="Payment due">{detail.payment_due_date ? fmtDate(detail.payment_due_date) : '—'}</DetailField>
                  </div>
                  <DetailField label="Insurer">{detail.insurer ?? '—'}</DetailField>
                  <DetailField label="Recipient">{detail.contacts?.email ?? 'No contact on file'}</DetailField>
                </>
              )}
            </DetailSection>

            <DetailSection label="Line items">
              {editing && form ? (
                <>
                  {form.lineItems.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 mb-1.5">
                      <input value={l.description} onChange={e => updateLineItem(i, { description: e.target.value })} placeholder="Description" className={`${inputCls} flex-1 min-w-0`} />
                      <input type="number" value={l.amount} onChange={e => updateLineItem(i, { amount: Number(e.target.value) })} className={`${inputCls} w-28 flex-none`} />
                      <button onClick={() => removeLineItem(i)} className="text-muted-foreground hover:text-[#3c4043] flex-none"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={addLineItem} className="flex items-center gap-1.5 text-[11.5px] text-[#202124] hover:underline mt-1 mb-3"><PlusCircle size={13} /> Add line item</button>

                  {/* Fee rebate toggle — sits above the price row it nets against */}
                  <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground mb-2 max-w-[220px]">
                    <span className="flex items-center gap-1.5">
                      <input type="checkbox" checked={feeRebateEnabled}
                        onChange={e => { setFeeRebateEnabled(e.target.checked); if (!e.target.checked) setForm(f => f && { ...f, feeRebate: 0 }) }} />
                      Apply fee rebate
                    </span>
                  </label>
                  {feeRebateEnabled && (
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground mb-2 max-w-[220px]">Fee rebate amount
                      <input type="number" value={form.feeRebate} onChange={e => setForm({ ...form, feeRebate: Number(e.target.value) })} className={inputCls} />
                    </label>
                  )}

                  {/* Price row — GST, currency, and the running total together */}
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground flex-1 min-w-[110px]">GST amount
                      <input type="number" value={form.gstAmount} onChange={e => setForm({ ...form, gstAmount: Number(e.target.value) })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground flex-1 min-w-[110px]">Currency
                      <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className={inputCls} />
                    </label>
                    <div className="flex flex-col gap-1 text-[10.5px] text-muted-foreground flex-1 min-w-[140px]">Premium Total
                      <div className="text-[12.5px] border border-border rounded-md px-2 py-1 bg-muted/40 font-semibold flex items-center h-[30px]">
                        {form.currency} {(form.lineItems.reduce((s, l) => s + l.amount, 0) + form.gstAmount - (feeRebateEnabled ? form.feeRebate : 0)).toLocaleString('en-SG', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {detail.line_items?.map((l, i) => (
                    <div key={i} className="flex justify-between text-[12px] mb-1"><span>{l.description}</span><span>{fmt(l.amount, detail.currency)}</span></div>
                  ))}
                  {!!detail.fee_rebate && <div className="flex justify-between text-[12px] mb-1"><span>Fee rebate</span><span>-{fmt(detail.fee_rebate, detail.currency)}</span></div>}
                  <div className="flex justify-between text-[13px] font-semibold border-t border-[--border-subtle] pt-1.5 mt-1"><span>Premium Total</span><span>{fmt(detail.net_amount, detail.currency)}</span></div>
                </>
              )}
            </DetailSection>

            {(editing || detail.commission != null || detail.drive_folder_url) && (
              <DetailSection label="Commission & archive">
                {editing && form ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Commission rate (%)
                      <input type="number" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: Number(e.target.value) })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Commission amount
                      <input type="number" value={form.commission} onChange={e => setForm({ ...form, commission: Number(e.target.value) })} className={inputCls} />
                    </label>
                  </div>
                ) : (
                  <>
                    {detail.commission != null && (
                      <DetailField label="Commission">{fmt(detail.commission, detail.currency)}{detail.commission_rate != null ? ` (${detail.commission_rate}%)` : ''}</DetailField>
                    )}
                    {detail.drive_folder_url && (
                      <DetailField label="Documents"><a href={detail.drive_folder_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#202124] hover:underline"><FolderOpen size={12} /> Open in Google Drive</a></DetailField>
                    )}
                  </>
                )}
              </DetailSection>
            )}

            <DetailSection label="Payment">
              <p className="text-[10.5px] text-muted-foreground mb-2.5">Not all of the premium always goes to the insurer directly — tag which channel(s) apply and track each independently for accounting.</p>
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-[--border-subtle] p-2.5">
                  <label className="flex items-center gap-2 text-[12px] font-medium mb-2 cursor-pointer">
                    <input type="checkbox" checked={payDirectToInsurer} onChange={e => setPayDirectToInsurer(e.target.checked)} className="accent-primary" />
                    (a) Direct to insurer
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Paid amount to insurer
                      <input type="number" value={paidDirectAmount} onChange={e => setPaidDirectAmount(Number(e.target.value))} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Status
                      <select value={paidDirectStatus} onChange={e => setPaidDirectStatus(e.target.value as PayStatus)} className={inputCls}>
                        <option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="rounded-md border border-[--border-subtle] p-2.5">
                  <label className="flex items-center gap-2 text-[12px] font-medium mb-2 cursor-pointer">
                    <input type="checkbox" checked={payToTrsOps} onChange={e => setPayToTrsOps(e.target.checked)} className="accent-primary" />
                    (b) Pay to TRS
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Paid to TRS Ops account
                      <input type="number" value={paidAmount} onChange={e => setPaidAmount(Number(e.target.value))} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10.5px] text-muted-foreground">Status
                      <select value={status} onChange={e => setStatus(e.target.value as PayStatus)} className={inputCls}>
                        <option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </DetailSection>

            {error && <p className="px-4 text-[11.5px] text-[#3c4043]">{error}</p>}

            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <a href={`/api/debit-notes/${id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><Download size={13} className="mr-1.5" /> PDF</Button></a>
                <Button variant="outline" size="sm" onClick={() => setSendPickerOpen(true)} disabled={!detail.contacts?.email || !detail.attachment_files?.length}>
                  <Send size={13} className="mr-1.5" /> Send documents
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {editing && <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>}
                <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {sendPickerOpen && detail && (
        <SendDocumentsModal
          target={{
            debitNoteId: detail.id, debitNoteNo: detail.debit_note_no, companyName: detail.companies?.name ?? null,
            contactEmail: detail.contacts?.email ?? null,
            contactName: [detail.contacts?.first_name, detail.contacts?.last_name].filter(Boolean).join(' ') || null,
            attachmentFiles: detail.attachment_files,
            companyId: detail.company_id, amount: detail.gross_amount, currency: detail.currency, insurer: detail.insurer,
          }}
          onClose={() => setSendPickerOpen(false)}
        />
      )}
    </Dialog>
  )
}
