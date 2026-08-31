'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { UploadCloud, Plus, Download, Send, Loader2, FolderOpen, Pencil, Trash2, PlusCircle, X, ArrowUp, ArrowDown, ArrowUpDown, ListFilter } from 'lucide-react'
import { AppSplitLayout, AppMainPanel, AppPageHeader, AppPageBody } from '@/components/app-shell'
import { DataTableToolbar, DataTableReset } from '@/components/data-table/toolbar'
import { StatusBadge } from '@/components/status-badge'
import { DetailSection, DetailField } from '@/components/detail-section'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { SendDocumentsModal, type SendableAttachment } from '@/components/debit-notes/SendDocumentsModal'
import { cn } from '@/lib/utils'

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

function ColumnHeader({
  col, sortKey, sortDir, onSort, filterValue, onFilterChange, statusFilter, onStatusFilterChange,
}: {
  col: Column
  sortKey: ColKey | null
  sortDir: SortDir
  onSort: (key: ColKey) => void
  filterValue?: string
  onFilterChange?: (v: string) => void
  statusFilter?: Set<PayStatus>
  onStatusFilterChange?: (s: Set<PayStatus>) => void
}) {
  const [open, setOpen] = useState(false)
  const active   = col.type === 'status' ? (statusFilter?.size ?? 0) > 0 : !!filterValue?.trim()
  const isSorted = sortKey === col.key
  const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown

  return (
    <th className={cn('px-3 py-2 font-semibold select-none', col.align === 'right' ? 'text-right' : 'text-left')}>
      <div className={cn('flex items-center gap-1', col.align === 'right' && 'justify-end')}>
        <button onClick={() => onSort(col.key)} className="flex items-center gap-1 hover:text-foreground transition-colors" title={`Sort by ${col.label}`}>
          {col.label}
          <SortIcon size={11} className={isSorted ? 'text-primary' : 'text-muted-foreground/40'} />
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              title={`Filter ${col.label}`}
              className={cn('p-0.5 rounded hover:bg-accent transition-colors', active ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
            >
              <ListFilter size={11} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align={col.align === 'right' ? 'end' : 'start'}>
            {col.type === 'status' ? (
              <div className="flex flex-col gap-0.5">
                {STATUS_OPTIONS.map(s => (
                  <label key={s} className="flex items-center gap-2 text-[12px] px-1.5 py-1 rounded hover:bg-accent cursor-pointer">
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
                  <button onClick={() => onStatusFilterChange?.(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground mt-1 text-left px-1.5">Clear</button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={filterValue ?? ''}
                  onChange={e => onFilterChange?.(e.target.value)}
                  placeholder={`Filter ${col.label.toLowerCase()}…`}
                  className="flex-1 min-w-0 text-[12px] border border-border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30"
                />
                {filterValue && (
                  <button onClick={() => onFilterChange?.('')} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X size={12} /></button>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
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
        <AppPageHeader
          title="Debit Notes"
          description="Every debit note sent to a client — generated here or bulk-imported from PDFs."
          actions={(
            <>
              <a href="https://drive.google.com/drive/folders/1fNWSYQdZwhkz2A4APmif41PLNwNWNv9r" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><FolderOpen size={14} className="mr-1.5" /> Open GDrive</Button>
              </a>
              <Link href="/debit-notes/historical"><Button variant="outline" size="sm"><UploadCloud size={14} className="mr-1.5" /> Generate Historical Debit Note</Button></Link>
              <Link href="/debit-notes/new"><Button size="sm"><Plus size={14} className="mr-1.5" /> Generate new debit note</Button></Link>
            </>
          )}
        />
        {(activeFilterCount > 0 || sortKey) && (
          <DataTableToolbar>
            <span className="text-[11.5px] text-muted-foreground">
              {sorted.length} of {rows.length} debit note{rows.length !== 1 ? 's' : ''}
              {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''}`}
              {sortKey && ` · sorted by ${COLUMNS.find(c => c.key === sortKey)?.label} (${sortDir === 'asc' ? 'ascending' : 'descending'})`}
            </span>
            <DataTableReset onReset={resetAll} />
          </DataTableToolbar>
        )}
        <AppPageBody padded={false}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[--border-subtle] text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
                {COLUMNS.map(col => (
                  <ColumnHeader
                    key={col.key}
                    col={col}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    filterValue={colFilters[col.key]}
                    onFilterChange={v => setColFilters(f => ({ ...f, [col.key]: v }))}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-[--border-subtle]"><td colSpan={9} className="px-4 h-11"><div className="skeleton sk-cell" style={{ width: '80%', height: 10 }} /></td></tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">{rows.length === 0 ? 'No debit notes yet.' : 'No debit notes match these filters.'}</td></tr>
              )}
              {!loading && sorted.map(r => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="border-b border-[--border-subtle] hover:bg-accent/40 cursor-pointer">
                  <td className="px-4 py-2.5 font-medium uppercase truncate max-w-[200px]">{r.companies?.name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[180px]">{r.policies?.class_of_insurance || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.policies?.policy_number || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.insurer ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px]">{r.debit_note_no}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(r.policies?.end_date ?? null)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmt(r.gross_amount, r.currency)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{r.commission != null ? fmt(r.commission, r.currency) : '—'}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="text-rose-600 hover:text-rose-600 border-rose-200 hover:bg-rose-50">
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
            {error && <p className="text-[11.5px] text-rose-600 mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
              <Button size="sm" onClick={del} disabled={deleting} className="bg-rose-600 hover:bg-rose-700">
                {deleting ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Trash2 size={13} className="mr-1.5" />} Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <DetailSection label="Client">
              <DetailField label="Company"><span className="uppercase">{detail.companies?.name ?? '—'}</span></DetailField>
              {!editing && detail.event_type === 'endorsement' && (
                <div className="mb-3 rounded-md border border-orange-200 bg-orange-50/60 px-2.5 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Mid-term endorsement</p>
                  <p className="text-[11.5px] text-orange-900">Effective {fmtDate(detail.endorsement_effective_date)}</p>
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
                      <button onClick={() => removeLineItem(i)} className="text-muted-foreground hover:text-rose-600 flex-none"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={addLineItem} className="flex items-center gap-1.5 text-[11.5px] text-primary hover:underline mt-1 mb-3"><PlusCircle size={13} /> Add line item</button>

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
                      <DetailField label="Documents"><a href={detail.drive_folder_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline"><FolderOpen size={12} /> Open in Google Drive</a></DetailField>
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

            {error && <p className="px-4 text-[11.5px] text-rose-600">{error}</p>}

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
