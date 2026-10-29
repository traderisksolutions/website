'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SectionCard, Empty, Spinner, Btn, Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate } from '@/lib/crm/format'
import { productLineLabel } from '@/lib/product-lines'
import { threadHref } from '@/lib/placement/position'
import type { PlacementBundle } from '@/lib/placement/types'
import { callApi, errText, dialogCls, selectCls, INK, MUTED, ERROR } from '@/components/placement/shared'
import { ContactPicker } from '@/components/placement/ContactPicker'
import {
  fmtAmount, MOVEMENT_WORD, MOVEMENT_STATUS_WORD, RELATION_WORD,
  type MembersPayload, type MovementKind, type PolicyMovement, type PolicyTransaction, type PolicyView, type SpineQuote,
} from './types'

const QUOTING = new Set(['quoting', 'presented'])

/**
 * Employment benefits after the quote: who is on the list, who joined and left, what the insurer
 * billed or credited for it, and where the client stands week by week. One section per EB policy.
 */
export function MembersPanel({ policies, bundle, onChanged, onOpenDrafts }: {
  policies: PolicyView[] | null
  bundle: PlacementBundle | null
  onChanged: () => void
  onOpenDrafts: () => void
}) {
  const eb = useMemo(() => (policies ?? []).filter(p => p.is_eb), [policies])
  if (!policies) return <Spinner label="Loading policies…" />
  if (eb.length === 0) return <SectionCard title="Members"><Empty compact>No employment benefits policy on this company.</Empty></SectionCard>
  return <>{eb.map(p => <PolicySection key={p.id} policy={p} bundle={bundle} onChanged={onChanged} onOpenDrafts={onOpenDrafts} />)}</>
}

function PolicySection({ policy, bundle, onChanged, onOpenDrafts }: {
  policy: PolicyView
  bundle: PlacementBundle | null
  onChanged: () => void
  onOpenDrafts: () => void
}) {
  const [data, setData] = useState<MembersPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'upload' | 'hr' | 'tierc' | 'movement' | 'note' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const listRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [census, setCensus] = useState<{ count: number; quotes: number } | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try { setData(await callApi<MembersPayload>(`/api/policies/${policy.id}/members`)) }
    catch (e) { setLoadError(errText(e)); setData({ members: [], movements: [], transactions: [], weekly: [], position: { pax_active: 0, net_to_date: 0, last_week: null } }) }
  }, [policy.id])
  useEffect(() => { void load() }, [load])

  const refresh = () => { void load(); onChanged() }

  const quoting = QUOTING.has(policy.lifecycle)
  const lineId = policy.placement_line_id
  const line = bundle?.lines.find(l => l.id === lineId) ?? null
  const engineQuotes = useMemo(() => lineId ? (bundle?.quotes as SpineQuote[] | undefined ?? []).filter(q => q.line_id === lineId && q.source === 'rate_table' && q.status !== 'superseded').length : 0, [bundle, lineId])
  const txById = useMemo(() => new Map((data?.transactions ?? []).map(t => [t.id, t])), [data])
  const reported = (data?.movements ?? []).filter(m => m.status === 'reported').length
  const title = `${policy.label ?? policy.class_of_insurance ?? 'Employment benefits'}${policy.insurer ? ` · ${policy.insurer}` : ''}`

  async function requestFromInsurer() {
    setBusy('request'); setError(null)
    try {
      await callApi<{ draftId: string }>(`/api/policies/${policy.id}/movements/request`, { method: 'POST', body: {} })
      refresh()
      onOpenDrafts()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  /** A member list for a live policy: adds who is not on file, removes nobody. */
  async function uploadMemberList(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy('list'); setError(null); setNotice(null)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await fetch(`/api/policies/${policy.id}/members`, { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({})) as { added?: number; already?: number; error?: string }
      if (!res.ok) throw new Error(d.error ?? `Upload failed (${res.status})`)
      setNotice(`${d.added ?? 0} added, ${d.already ?? 0} already on file`)
      refresh()
    } catch (e) { setError(errText(e)) } finally { setBusy(null); if (listRef.current) listRef.current.value = '' }
  }

  /** The insurer's note into the debit-note review queue, to raise the TRS debit or credit note. */
  async function raiseNote(transactionId: string) {
    setBusy(`bill:${transactionId}`); setError(null); setNotice(null)
    try {
      await callApi<{ bundle_id: string }>(`/api/policies/transactions/${transactionId}/bill`, { method: 'POST', body: {} })
      setNotice('The insurer note is in Debit notes for review. Approving it there links the TRS note here.')
      refresh()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  const members = data?.members ?? []
  const movements = [...(data?.movements ?? [])].sort((a, b) => (b.effective_on ?? b.created_at).localeCompare(a.effective_on ?? a.created_at))
  const transactions = [...(data?.transactions ?? [])].sort((a, b) => (b.issued_on ?? b.created_at).localeCompare(a.issued_on ?? a.created_at))
  const weekly = [...(data?.weekly ?? [])].sort((a, b) => b.week_start.localeCompare(a.week_start))

  return (
    <SectionCard title={title}>
      {error && <p className="text-[13px] m-0 mb-3" style={{ color: ERROR }}>{error}</p>}
      {notice && <p className="text-[13px] m-0 mb-3" style={{ color: INK }}>{notice}</p>}
      {loadError && <p className="text-[13px] m-0 mb-3" style={{ color: ERROR }}>{loadError}</p>}

      {/* 1. Employee list */}
      <Sub
        title="Employee list"
        actions={quoting ? (
          <>
            <Btn size="xs" level="secondary" disabled={!lineId} onClick={() => setDialog('upload')}>Upload list</Btn>
            <Btn size="xs" level="secondary" disabled={!lineId} onClick={() => setDialog('hr')}>Send HR a link</Btn>
            <Btn size="xs" level="tertiary" disabled={!lineId || busy !== null} onClick={() => setDialog('tierc')}>Ask Tier C insurers</Btn>
          </>
        ) : (
          <>
            <input ref={listRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => void uploadMemberList(e.target.files)} />
            <Btn size="xs" level="secondary" loading={busy === 'list'} disabled={busy !== null} onClick={() => listRef.current?.click()}>Upload member list</Btn>
          </>
        )}
      >
        {quoting ? (
          <p className="m-0 text-[14px]" style={{ color: INK }}>
            {!lineId && 'No placement line linked to this policy.'}
            {lineId && (
              <>
                {census ? `${census.count} on the list` : (line as { census_submission_id?: string | null } | null)?.census_submission_id ? 'List received' : 'No list yet'}
                {' · '}
                {`${census?.quotes ?? engineQuotes} engine quote${(census?.quotes ?? engineQuotes) === 1 ? '' : 's'}`}
              </>
            )}
          </p>
        ) : !data ? <Spinner label="Loading members…" /> : members.length === 0 ? <Empty compact>No members on file.</Empty> : (
          <Register label={`${title} members`} minWidth={900}>
            <RegisterHead>
              <RegisterTh first>Name</RegisterTh>
              <RegisterTh>Relation</RegisterTh>
              <RegisterTh>Category</RegisterTh>
              <RegisterTh>Plan</RegisterTh>
              <RegisterTh>Joined</RegisterTh>
              <RegisterTh>Left</RegisterTh>
              <RegisterTh last>Status</RegisterTh>
            </RegisterHead>
            <tbody>
              {members.map(m => (
                <RegisterRow key={m.id}>
                  <RegisterCell first identityWidth={240} primary={m.member_name} secondary={m.employee_ref && !/^m\d+$/.test(m.employee_ref) ? m.employee_ref : undefined} />
                  <RegisterCell primary={RELATION_WORD[m.relationship] ?? m.relationship} />
                  <RegisterCell primary={m.category ?? '—'} />
                  <RegisterCell primary={m.plan_code ?? '—'} />
                  <RegisterCell primary={m.joined_on ? fmtDate(m.joined_on) : '—'} />
                  <RegisterCell primary={m.left_on ? fmtDate(m.left_on) : '—'} />
                  <RegisterCell last primary={m.status === 'left' ? 'Left' : 'Active'} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}
      </Sub>

      {/* 2. Movements */}
      <Sub
        title="Movements"
        actions={
          <>
            <Btn size="xs" level="secondary" onClick={() => setDialog('movement')}>Record movement</Btn>
            <Btn size="xs" level="primary" disabled={reported === 0 || busy !== null} loading={busy === 'request'} onClick={requestFromInsurer}>Request from insurer{reported > 0 ? ` (${reported})` : ''}</Btn>
          </>
        }
      >
        {!data ? <Spinner /> : movements.length === 0 ? <Empty compact>No movements recorded.</Empty> : (
          <Register label={`${title} movements`} minWidth={960}>
            <RegisterHead>
              <RegisterTh first>Date</RegisterTh>
              <RegisterTh>Kind</RegisterTh>
              <RegisterTh>Member</RegisterTh>
              <RegisterTh align="right">Pax</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh>Insurer note</RegisterTh>
              <RegisterTh align="right">Expected</RegisterTh>
              <RegisterTh last align="right">Amount</RegisterTh>
            </RegisterHead>
            <tbody>
              {movements.map(m => {
                const tx = m.transaction_id ? txById.get(m.transaction_id) ?? null : null
                return (
                  <RegisterRow key={m.id}>
                    <RegisterCell first identityWidth={140} primary={fmtDate(m.effective_on ?? m.created_at)} secondary={m.effective_on ? undefined : 'reported'} />
                    <RegisterCell primary={MOVEMENT_WORD[m.kind] ?? m.kind} />
                    <RegisterCell primary={m.member_name} secondary={m.relationship ? RELATION_WORD[m.relationship] ?? m.relationship : undefined} />
                    <RegisterCell align="right" primary={m.pax} />
                    <RegisterCell primary={MOVEMENT_STATUS_WORD[m.status] ?? m.status} secondary={[m.sent_at ? `sent ${fmtDate(m.sent_at)}` : null, m.chase_count ? `${m.chase_count} chaser${m.chase_count === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || undefined} />
                    <RegisterCell primary={tx ? (tx.note_no ?? (tx.kind === 'credit' ? 'Credit note' : 'Debit note')) : '—'} />
                    <RegisterCell align="right" primary={m.estimate_amount != null ? fmtAmount(Number(m.estimate_amount), policy.currency ?? 'SGD') : '—'} secondary={m.estimate_basis ?? undefined} />
                    <RegisterCell last align="right" primary={tx ? fmtAmount(tx.amount, tx.currency) : '—'} />
                  </RegisterRow>
                )
              })}
            </tbody>
          </Register>
        )}
      </Sub>

      {/* 3. Insurer notes */}
      <Sub title="Insurer notes" actions={<Btn size="xs" level="secondary" onClick={() => setDialog('note')}>Record note</Btn>}>
        {!data ? <Spinner /> : transactions.length === 0 ? <Empty compact>No insurer notes recorded.</Empty> : (
          <Register label={`${title} insurer notes`} minWidth={960}>
            <RegisterHead>
              <RegisterTh first>Date</RegisterTh>
              <RegisterTh>Kind</RegisterTh>
              <RegisterTh>Note no</RegisterTh>
              <RegisterTh align="right">Pax</RegisterTh>
              <RegisterTh align="right">Amount</RegisterTh>
              <RegisterTh align="right">Expected</RegisterTh>
              <RegisterTh>Description</RegisterTh>
              <RegisterTh>Thread</RegisterTh>
              <RegisterTh last>TRS note</RegisterTh>
            </RegisterHead>
            <tbody>
              {transactions.map(t => (
                <RegisterRow key={t.id}>
                  <RegisterCell first identityWidth={140} primary={fmtDate(t.issued_on ?? t.created_at)} secondary={t.period_start || t.period_end ? `${fmtDate(t.period_start)} – ${fmtDate(t.period_end)}` : undefined} />
                  <RegisterCell primary={t.kind === 'credit' ? 'Credit' : 'Debit'} secondary={t.needs_review ? 'check' : undefined} />
                  <RegisterCell primary={t.note_no ?? '—'} />
                  <RegisterCell align="right" primary={t.pax ?? '—'} />
                  <RegisterCell align="right" primary={fmtAmount(t.amount, t.currency)} />
                  <RegisterCell align="right" primary={t.estimate_amount != null ? fmtAmount(Number(t.estimate_amount), t.currency) : '—'} secondary={t.variance_amount != null && Math.abs(Number(t.variance_amount)) > 1 ? `${Number(t.variance_amount) > 0 ? '+' : ''}${fmtAmount(Number(t.variance_amount), t.currency)} vs expected` : undefined} />
                  <RegisterCell nowrap={false}><span className="block text-[14px] max-w-[360px]" style={{ color: INK }}>{t.description ?? (t.member_names.length ? t.member_names.join(', ') : '—')}</span></RegisterCell>
                  <RegisterCell>
                    {t.source_thread_id
                      ? <Link href={threadHref(t.source_thread_id) ?? '#'} className="text-[14px] no-underline hover:underline" style={{ color: INK }}>Thread</Link>
                      : <span className="text-[14px]" style={{ color: MUTED }}>—</span>}
                  </RegisterCell>
                  <RegisterCell last>
                    {t.debit_note_id
                      ? <Link href="/debit-notes" className="text-[14px] no-underline hover:underline" style={{ color: INK }}>Issued</Link>
                      : t.bundle_id
                        ? <Link href="/debit-notes/new" className="text-[14px] no-underline hover:underline" style={{ color: INK }}>In review</Link>
                        : <Btn size="xs" level="tertiary" loading={busy === `bill:${t.id}`} disabled={busy !== null || !t.source_attachment_id} title={t.source_attachment_id ? undefined : 'No insurer document on file; raise it from Debit notes'} onClick={() => void raiseNote(t.id)}>Raise TRS note</Btn>}
                  </RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}
      </Sub>

      {/* 4. Weekly position */}
      <Sub title="Weekly position">
        {!data ? <Spinner /> : weekly.length === 0 ? <Empty compact>No week recorded yet.</Empty> : (
          <Register label={`${title} weekly position`} minWidth={960}>
            <RegisterHead>
              <RegisterTh first>Week</RegisterTh>
              <RegisterTh align="right">Pax</RegisterTh>
              <RegisterTh align="right">Joins</RegisterTh>
              <RegisterTh align="right">Leaves</RegisterTh>
              <RegisterTh align="right">Billed</RegisterTh>
              <RegisterTh align="right">Credited</RegisterTh>
              <RegisterTh align="right">Net week</RegisterTh>
              <RegisterTh last align="right">Net to date</RegisterTh>
            </RegisterHead>
            <tbody>
              {weekly.map(w => (
                <RegisterRow key={w.id ?? w.week_start}>
                  <RegisterCell first identityWidth={160} primary={fmtDate(w.week_start)} />
                  <RegisterCell align="right" primary={w.pax_active} />
                  <RegisterCell align="right" primary={w.joins} />
                  <RegisterCell align="right" primary={w.leaves} />
                  <RegisterCell align="right" primary={fmtAmount(w.billed, policy.currency ?? 'SGD')} />
                  <RegisterCell align="right" primary={fmtAmount(-Math.abs(Number(w.credited)), policy.currency ?? 'SGD')} />
                  <RegisterCell align="right" primary={fmtAmount(w.net_week, policy.currency ?? 'SGD')} />
                  <RegisterCell last align="right" primary={fmtAmount(w.net_to_date, policy.currency ?? 'SGD')} />
                </RegisterRow>
              ))}
            </tbody>
          </Register>
        )}
      </Sub>

      {lineId && <UploadListDialog open={dialog === 'upload'} lineId={lineId} onClose={() => setDialog(null)} onDone={r => { setCensus(r); refresh() }} />}
      {lineId && <SendHrLinkDialog open={dialog === 'hr'} lineId={lineId} onClose={() => setDialog(null)} onDone={refresh} />}
      {lineId && (
        <AskTierCDialog
          open={dialog === 'tierc'} lineId={lineId} productLine={line?.product_line ?? policy.product_line ?? 'employee_benefits'}
          onClose={() => setDialog(null)}
          onDone={unrouted => { refresh(); if (unrouted.length) setError(`No contact on file for: ${unrouted.join(', ')}.`); else onOpenDrafts() }}
        />
      )}
      <RecordMovementDialog open={dialog === 'movement'} policyId={policy.id} onClose={() => setDialog(null)} onDone={refresh} />
      <RecordNoteDialog open={dialog === 'note'} policyId={policy.id} currency={policy.currency ?? 'SGD'} onClose={() => setDialog(null)} onDone={refresh} />
    </SectionCard>
  )
}

/** A sub-section inside the policy card: a 14px heading, its actions on the right, then content. */
function Sub({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-0 border-t first:border-t-0" style={{ borderColor: '#e6e8e4' }}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="m-0 text-[14px] font-medium" style={{ color: INK }}>{title}</h3>
        {actions && <div className="flex items-center gap-1.5 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────────────────────

/** The Tier C insurer contacts on file for the line; the broker picks who gets the request. */
function AskTierCDialog({ open, lineId, productLine, onClose, onDone }: {
  open: boolean; lineId: string; productLine: string; onClose: () => void; onDone: (unrouted: string[]) => void
}) {
  const [picks, setPicks] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setPicks(null); setBusy(false); setError(null) } }, [open])

  async function draft() {
    setBusy(true); setError(null)
    try {
      const d = await callApi<{ dispatches: unknown[]; drafts: number; unrouted: string[] }>(`/api/placements/lines/${lineId}/tier-c`, { method: 'POST', body: { contact_ids: picks ? [...picks] : undefined } })
      onDone(Array.isArray(d.unrouted) ? d.unrouted : [])
      onClose()
    } catch (e) { setError(errText(e)); setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Ask Tier C insurers</DialogTitle>
          <DialogDescription>{productLineLabel(productLine)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <ContactPicker productLines={[productLine]} tier="c" value={picks} onChange={setPicks} />
          {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn level="primary" className="h-10 px-4" onClick={draft} loading={busy} disabled={picks === null}>Draft the requests</Btn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A spreadsheet of employees: read on the server, then priced by the rate engine on the same call. */
function UploadListDialog({ open, lineId, onClose, onDone }: { open: boolean; lineId: string; onClose: () => void; onDone: (r: { count: number; quotes: number }) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('new_business')
  const [busy, setBusy] = useState<'reading' | 'pricing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; issues: string[]; quotes: number; partial: boolean; notes: string[] } | null>(null)

  useEffect(() => { if (open) { setFile(null); setBasis('new_business'); setBusy(null); setError(null); setResult(null) } }, [open])

  async function run() {
    if (!file) return
    setBusy('reading'); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/placements/lines/${lineId}/census`, { method: 'POST', body: fd, cache: 'no-store' })
      const read = await res.json().catch(() => ({})) as { census?: unknown[]; issues?: unknown[]; error?: string }
      if (!res.ok) throw new Error(read.error ?? `Request failed (${res.status}).`)
      const census = read.census ?? []
      if (census.length === 0) throw new Error('No employees were read from that file.')
      setBusy('pricing')
      const priced = await callApi<{ quotation_id: string; quotes: unknown[]; partial: boolean; notes: string[] }>(`/api/placements/lines/${lineId}/price`, { method: 'POST', body: { census, basis } })
      const r = { count: census.length, issues: (read.issues ?? []).map(String), quotes: priced.quotes?.length ?? 0, partial: !!priced.partial, notes: priced.notes ?? [] }
      setResult(r)
      onDone({ count: r.count, quotes: r.quotes })
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Upload list</DialogTitle>
          <DialogDescription>Employee list as .xlsx or .csv</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px]" style={{ color: INK }}>{result.count} on the list · {result.quotes} engine quote{result.quotes === 1 ? '' : 's'}{result.partial ? ' · some insurers could not be priced' : ''}</p>
            {result.notes.length > 0 && <ul className="m-0 pl-4 text-[13px]" style={{ color: MUTED }}>{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            {result.issues.length > 0 && <ul className="m-0 pl-4 text-[13px]" style={{ color: MUTED }}>{result.issues.slice(0, 10).map((n, i) => <li key={i}>{n}</li>)}</ul>}
            <div className="flex justify-end pt-2"><Btn level="primary" className="h-10 px-4" onClick={onClose}>Done</Btn></div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="File">
              <input type="file" accept=".xlsx,.xls,.csv" className="block w-full text-[14px]" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Basis">
              <select className={selectCls} value={basis} onChange={e => setBasis(e.target.value as 'new_business' | 'renewal')}>
                <option value="new_business">New business</option>
                <option value="renewal">Renewal</option>
              </select>
            </Field>
            {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Btn level="tertiary" onClick={onClose} disabled={busy !== null}>Cancel</Btn>
              <Btn level="primary" className="h-10 px-4" onClick={run} loading={busy !== null} disabled={!file}>{busy === 'reading' ? 'Reading the list…' : busy === 'pricing' ? 'Pricing…' : 'Upload and price'}</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const EMAIL_OK = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/** HR fills the list on a public page; the link is emailed from operations@. */
function SendHrLinkDialog({ open, lineId, onClose, onDone }: { open: boolean; lineId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cc, setCc] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ url: string; mailError?: string } | null>(null)

  useEffect(() => { if (open) { setName(''); setEmail(''); setCc(''); setMessage(''); setBusy(false); setError(null); setSent(null) } }, [open])

  async function send() {
    if (!name.trim()) { setError('Recipient name is required.'); return }
    if (!EMAIL_OK(email)) { setError('Recipient email is not a valid address.'); return }
    if (cc.trim() && !EMAIL_OK(cc)) { setError('Copy email is not a valid address.'); return }
    setBusy(true); setError(null)
    try {
      const d = await callApi<{ link: unknown; url: string; mailError?: string }>(`/api/placements/lines/${lineId}/hr-link`, {
        method: 'POST', body: { recipient_name: name.trim(), recipient_email: email.trim(), cc_email: cc.trim() || undefined, message: message.trim() || undefined },
      })
      setSent({ url: d.url, mailError: d.mailError })
      onDone()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Send HR a link</DialogTitle>
          <DialogDescription>From operations@trade-risksol.com</DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px]" style={{ color: INK }}>{sent.mailError ? `Link created. Email not sent: ${sent.mailError}` : 'Link sent.'}</p>
            <p className="m-0 text-[13px] break-all" style={{ color: MUTED }}>{sent.url}</p>
            <div className="flex justify-end pt-2"><Btn level="primary" className="h-10 px-4" onClick={onClose}>Done</Btn></div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Recipient name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
              <Field label="Recipient email"><input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
            </div>
            <Field label="Copy"><input className={inputCls} type="email" value={cc} onChange={e => setCc(e.target.value)} /></Field>
            <Field label="Message"><textarea className={textareaCls} rows={4} value={message} onChange={e => setMessage(e.target.value)} /></Field>
            {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
              <Btn level="primary" className="h-10 px-4" onClick={send} loading={busy}>Send</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A joiner, leaver or change the client told us about outside email. */
function RecordMovementDialog({ open, policyId, onClose, onDone }: { open: boolean; policyId: string; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<MovementKind>('join')
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('employee')
  const [effective, setEffective] = useState('')
  const [pax, setPax] = useState('1')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setKind('join'); setName(''); setRelationship('employee'); setEffective(''); setPax('1'); setDetail(''); setBusy(false); setError(null) } }, [open])

  async function save() {
    if (!name.trim()) { setError('Member name is required.'); return }
    const n = Number(pax)
    if (!Number.isInteger(n) || n < 1) { setError('Pax must be a whole number of 1 or more.'); return }
    setBusy(true); setError(null)
    try {
      await callApi<{ movement: PolicyMovement }>(`/api/policies/${policyId}/movements`, {
        method: 'POST', body: { kind, member_name: name.trim(), relationship, effective_on: effective || undefined, pax: n, detail: detail.trim() ? { note: detail.trim() } : undefined },
      })
      onDone(); onClose()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Record movement</DialogTitle>
          <DialogDescription>Reported outside email</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Kind">
              <select className={selectCls} value={kind} onChange={e => setKind(e.target.value as MovementKind)}>
                <option value="join">Joiner</option>
                <option value="leave">Leaver</option>
                <option value="change">Change</option>
              </select>
            </Field>
            <Field label="Relation">
              <select className={selectCls} value={relationship} onChange={e => setRelationship(e.target.value)}>
                {Object.entries(RELATION_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Member name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Effective on"><input className={inputCls} type="date" value={effective} onChange={e => setEffective(e.target.value)} /></Field>
            <Field label="Pax"><input className={inputCls} type="number" min={1} step={1} value={pax} onChange={e => setPax(e.target.value)} /></Field>
          </div>
          <Field label="Detail"><input className={inputCls} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Plan, category, date of birth" /></Field>
          {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn level="primary" className="h-10 px-4" onClick={save} loading={busy}>Record</Btn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** An insurer debit or credit note that arrived outside email. Amount entered positive; a credit is stored negative. */
function RecordNoteDialog({ open, policyId, currency: defaultCurrency, onClose, onDone }: { open: boolean; policyId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<'debit' | 'credit'>('debit')
  const [noteNo, setNoteNo] = useState('')
  const [issued, setIssued] = useState('')
  const [pax, setPax] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [description, setDescription] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [names, setNames] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setKind('debit'); setNoteNo(''); setIssued(''); setPax(''); setAmount(''); setCurrency(defaultCurrency); setDescription(''); setPeriodStart(''); setPeriodEnd(''); setNames(''); setBusy(false); setError(null)
  }, [open, defaultCurrency])

  async function save() {
    const amt = Number(amount)
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) { setError('Amount must be a positive number.'); return }
    const paxN = pax.trim() ? Number(pax) : undefined
    if (paxN !== undefined && (!Number.isInteger(paxN) || paxN < 0)) { setError('Pax must be a whole number.'); return }
    setBusy(true); setError(null)
    try {
      await callApi<{ transaction: PolicyTransaction }>(`/api/policies/${policyId}/transactions`, {
        method: 'POST',
        body: {
          kind, note_no: noteNo.trim() || undefined, issued_on: issued || undefined, pax: paxN, amount: amt, currency: currency.trim() || 'SGD',
          description: description.trim() || undefined, period_start: periodStart || undefined, period_end: periodEnd || undefined,
          member_names: names.split(',').map(s => s.trim()).filter(Boolean),
        },
      })
      onDone(); onClose()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={dialogCls}>
        <DialogHeader>
          <DialogTitle>Record note</DialogTitle>
          <DialogDescription>Insurer debit or credit note</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Kind">
              <select className={selectCls} value={kind} onChange={e => setKind(e.target.value as 'debit' | 'credit')}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </Field>
            <Field label="Note no"><input className={inputCls} value={noteNo} onChange={e => setNoteNo(e.target.value)} /></Field>
            <Field label="Issued on"><input className={inputCls} type="date" value={issued} onChange={e => setIssued(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Amount"><input className={inputCls} type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
            <Field label="Currency"><input className={inputCls} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
            <Field label="Pax"><input className={inputCls} type="number" min={0} step={1} value={pax} onChange={e => setPax(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Period start"><input className={inputCls} type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></Field>
            <Field label="Period end"><input className={inputCls} type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></Field>
          </div>
          <Field label="Description"><input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} /></Field>
          <Field label="Member names" hint="Comma-separated"><input className={inputCls} value={names} onChange={e => setNames(e.target.value)} /></Field>
          {error && <p className="text-[13px] m-0" style={{ color: ERROR }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn level="primary" className="h-10 px-4" onClick={save} loading={busy}>Record</Btn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
