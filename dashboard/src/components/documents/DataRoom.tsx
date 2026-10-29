'use client'

/**
 * The company's data room: one block per policy with its documents and what it still needs,
 * then the documents waiting to be sorted. Every document is filed in the company's Drive folder.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, Upload } from 'lucide-react'
import { Btn, Chip, Empty, SectionCard, Spinner } from '@/components/crm/primitives'
import { Register, RegisterCell, RegisterEmpty, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { callApi, errText, ERROR, INK, MUTED } from '@/components/placement/shared'
import { DOC_TYPES, docLabel, type DataRoomStatus } from '@/lib/documents/taxonomy'
import type { PolicyDocument } from '@/lib/documents/store'

type Room = {
  policy: { id: string; label: string | null; insurer: string | null; policy_number: string | null; lifecycle: string; start_date: string | null; end_date: string | null; drive_folder_url: string | null; is_eb: boolean }
  status: DataRoomStatus
  documents: PolicyDocument[]
}
type Data = { rooms: Room[]; unsorted: PolicyDocument[]; total: number }

const LIFECYCLE_WORD: Record<string, string> = { quoting: 'Quoting', presented: 'Presented', bound: 'Bound', live: 'In force', renewal_due: 'Renewal due', lapsed: 'Lapsed' }
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'
const period = (a: string | null, b: string | null) => a || b ? `${fmtDate(a)} – ${fmtDate(b)}` : null
const selCls = 'h-7 rounded-[6px] border border-[#dadce0] bg-white px-1.5 text-[12.5px] outline-none focus:border-[#202124] max-w-[190px]'

export function statusWord(s: DataRoomStatus): string {
  if (s.state === 'none') return 'Nothing required'
  if (s.state === 'complete') return 'Complete'
  return `${s.missing.length} pending`
}

export function DataRoom({ companyId }: { companyId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [uploadPolicy, setUploadPolicy] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try { setData(await callApi<Data>(`/api/companies/${companyId}/data-room`)); setError(null) }
    catch (e) { setError(errText(e)) }
  }, [companyId])
  useEffect(() => { void load() }, [load])

  async function patch(doc: PolicyDocument, body: Record<string, unknown>) {
    setBusy(doc.id); setNotice(null)
    try { await callApi(`/api/documents/${doc.id}`, { method: 'PATCH', body }); await load() }
    catch (e) { setNotice(errText(e)) }
    finally { setBusy(null) }
  }

  async function newPolicy(doc: PolicyDocument) {
    setBusy(doc.id); setNotice(null)
    try { await callApi(`/api/documents/${doc.id}/policy`, { method: 'POST', body: {} }); setNotice('Policy created from the document.'); await load() }
    catch (e) { setNotice(errText(e)) }
    finally { setBusy(null) }
  }

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy('upload'); setNotice(null)
    try {
      const form = new FormData()
      form.set('file', file)
      if (uploadPolicy) form.set('policy_id', uploadPolicy)
      const res = await fetch(`/api/companies/${companyId}/data-room`, { method: 'POST', body: form })
      const d = await res.json().catch(() => null) as { error?: string; document?: PolicyDocument } | null
      if (!res.ok) throw new Error(d?.error ?? `Upload failed (${res.status}).`)
      const doc = d?.document
      setNotice(doc ? `${file.name} filed as ${docLabel(doc.doc_type)}${doc.policy_id ? '' : ', waiting to be sorted'}.` : `${file.name} uploaded.`)
      await load()
    } catch (e) { setNotice(errText(e)) }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = '' }
  }

  if (error) return <Empty>{error}</Empty>
  if (!data) return <Spinner label="Loading documents" />

  const policyOptions = data.rooms.map(r => ({ id: r.policy.id, label: [r.policy.label, r.policy.insurer, r.policy.policy_number].filter(Boolean).join(' · ') }))

  const docRow = (d: PolicyDocument, sortable: boolean) => (
    <RegisterRow key={d.id}>
      <RegisterCell first primary={fmtDate(d.received_at)} />
      <RegisterCell>
        <select className={selCls} value={d.doc_type} disabled={busy === d.id} aria-label="Document type" onChange={e => void patch(d, { doc_type: e.target.value })}>
          {DOC_TYPES.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
        </select>
        {d.needs_review && <span className="ml-2"><Chip title="The agent was not sure; check the type and the policy">Check</Chip></span>}
      </RegisterCell>
      <RegisterCell title={d.filename}>
        <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="no-underline hover:underline" style={{ color: INK }}>{d.title || d.filename}</a>
      </RegisterCell>
      <RegisterCell>{d.insurer_name ?? <span style={{ color: MUTED }}>–</span>}</RegisterCell>
      <RegisterCell>{d.source === 'upload' ? `Uploaded${d.uploaded_by ? ` by ${d.uploaded_by.split('@')[0]}` : ''}` : (d.from_address ?? '–')}</RegisterCell>
      <RegisterCell>
        {d.status === 'filed' && d.drive_url ? <a href={d.drive_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 no-underline hover:underline" style={{ color: INK }}>Drive <ExternalLink size={11} /></a>
          : d.status === 'failed' ? <span title={d.error ?? ''} style={{ color: ERROR }}>Not filed</span>
          : <span style={{ color: MUTED }}>Filing…</span>}
      </RegisterCell>
      <RegisterCell last align="right">
        {sortable ? (
          <span className="inline-flex items-center gap-2">
            <select className={selCls} value="" disabled={busy === d.id || policyOptions.length === 0} aria-label="Move to policy" onChange={e => e.target.value && void patch(d, { policy_id: e.target.value })}>
              <option value="">{policyOptions.length ? 'Move to policy…' : 'No policies'}</option>
              {policyOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {['cover_note', 'policy_schedule', 'certificate'].includes(d.doc_type) && <Btn size="xs" level="secondary" disabled={busy === d.id} onClick={() => void newPolicy(d)}>New policy</Btn>}
            <Btn size="xs" level="tertiary" disabled={busy === d.id} onClick={() => void patch(d, { ignore: true })}>Ignore</Btn>
          </span>
        ) : (
          <Btn size="xs" level="tertiary" disabled={busy === d.id} onClick={() => void patch(d, { policy_id: null })}>Unlink</Btn>
        )}
      </RegisterCell>
    </RegisterRow>
  )

  const head = (
    <RegisterHead>
      <RegisterTh first width={110}>Received</RegisterTh>
      <RegisterTh width={220}>Type</RegisterTh>
      <RegisterTh>Document</RegisterTh>
      <RegisterTh width={160}>Insurer</RegisterTh>
      <RegisterTh width={200}>From</RegisterTh>
      <RegisterTh width={90}>Filed</RegisterTh>
      <RegisterTh last align="right" width={120}> </RegisterTh>
    </RegisterHead>
  )

  return (
    <div>
      <SectionCard
        title="Data room"
        actions={<>
          <select className={selCls} value={uploadPolicy} onChange={e => setUploadPolicy(e.target.value)} aria-label="Upload to policy">
            <option value="">Match to a policy for me</option>
            {policyOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input ref={fileRef} type="file" className="hidden" onChange={e => void upload(e.target.files)} />
          <Btn level="primary" disabled={busy === 'upload'} loading={busy === 'upload'} onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload document</Btn>
        </>}
      >
        {notice && <p className="m-0 mb-3 text-[13.5px]" style={{ color: INK }}>{notice}</p>}
        {data.rooms.length === 0 && data.unsorted.length === 0 && <Empty>No documents yet. Upload one, or they arrive here from email.</Empty>}

        {data.rooms.map(r => (
          <div key={r.policy.id} className="mb-6">
            <div className="flex items-center gap-3 flex-wrap mb-2 text-[13.5px]">
              <b className="font-medium text-[14.5px]" style={{ color: INK }}>{r.policy.label ?? 'Policy'}</b>
              {r.policy.insurer && <span style={{ color: MUTED }}>{r.policy.insurer}</span>}
              {r.policy.policy_number && <span style={{ color: MUTED }}>{r.policy.policy_number}</span>}
              {period(r.policy.start_date, r.policy.end_date) && <span style={{ color: MUTED }}>{period(r.policy.start_date, r.policy.end_date)}</span>}
              <Chip>{LIFECYCLE_WORD[r.policy.lifecycle] ?? r.policy.lifecycle}</Chip>
              <Chip title={r.status.missing.length ? `Missing: ${r.status.missing.map(m => m.label).join(', ')}` : undefined}>Documents: {statusWord(r.status)}</Chip>
              {r.policy.drive_folder_url && <a href={r.policy.drive_folder_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 no-underline hover:underline" style={{ color: INK }}><FolderOpen size={13} /> Drive folder</a>}
            </div>
            {r.status.missing.length > 0 && (
              <p className="m-0 mb-2 text-[13px]" style={{ color: MUTED }}>Missing: {r.status.missing.map(m => m.label).join(' · ')}</p>
            )}
            <Register label={`Documents for ${r.policy.label ?? 'policy'}`} minWidth={980}>
              {head}
              <tbody>
                {r.documents.length === 0 ? <RegisterEmpty colSpan={7}>No documents on this policy.</RegisterEmpty> : r.documents.map(d => docRow(d, false))}
              </tbody>
            </Register>
          </div>
        ))}

        {data.unsorted.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-3 mb-2 text-[13.5px]">
              <b className="font-medium text-[14.5px]" style={{ color: INK }}>To sort</b>
              <span style={{ color: MUTED }}>{data.unsorted.length}</span>
            </div>
            <Register label="Documents to sort" minWidth={1080}>
              {head}
              <tbody>
                {data.unsorted.map(d => docRow(d, true))}
              </tbody>
            </Register>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
