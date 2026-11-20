'use client'

/**
 * File to Drive (docs/filing.md). Opens on one email attachment or one data-room document; the
 * company, policy and type come suggested by rules, the person confirms, and the path shows where
 * the file will sit before it is filed. Self-contained: give it the id.
 */
import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Btn, Field } from '@/components/crm/primitives'
import { SelectBox } from '@/components/ui/select-box'
import { CompanyField, type CompanyPick } from '@/components/group-benefits/CompanyField'
import { DOC_TYPES } from '@/lib/documents/taxonomy'
import { filingPath, pathLabel } from '@/lib/filing/tree'
import type { FilingSuggestion } from '@/lib/filing/server'
import { fmtDate } from '@/lib/format'

export type FileRef = { attachmentId: string; documentId?: undefined } | { documentId: string; attachmentId?: undefined }
type Filed = { id: string; status: string; drive_url: string | null; error: string | null }

const NO_POLICY = ''
const ALL_LINES = ''

export function FileDialog({ open, onClose, onFiled, ...ref }: FileRef & { open: boolean; onClose: () => void; onFiled?: (doc: Filed) => void }) {
  const [s, setS] = useState<FilingSuggestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState<CompanyPick>({ id: null, name: '' })
  const [line, setLine] = useState(ALL_LINES)
  const [policyId, setPolicyId] = useState(NO_POLICY)
  const [docType, setDocType] = useState('other')
  const [saving, setSaving] = useState(false)
  const [filed, setFiled] = useState<Filed | null>(null)

  const query = (companyId?: string | null) => {
    const q = new URLSearchParams(ref.attachmentId ? { attachment: ref.attachmentId } : { document: ref.documentId! })
    if (companyId) q.set('company', companyId)
    return `/api/filing?${q}`
  }

  async function load(companyId?: string | null, keepType = false) {
    setError(null)
    try {
      const res = await fetch(query(companyId), { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not read the file.')
      const next = d as FilingSuggestion
      setS(next)
      if (next.company) setCompany({ id: next.company.id, name: next.company.name })
      setPolicyId(next.policy_id ?? NO_POLICY)
      setLine(next.policies.find(p => p.id === next.policy_id)?.line_code ?? ALL_LINES)
      if (!keepType) setDocType(next.doc_type)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  useEffect(() => {
    if (!open) return
    setS(null); setFiled(null); setCompany({ id: null, name: '' }); setLine(ALL_LINES); setPolicyId(NO_POLICY); setDocType('other')
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref.attachmentId, ref.documentId])

  function pickCompany(c: CompanyPick) {
    setCompany(c)
    if (c.id && c.id !== s?.company?.id) void load(c.id, true)
  }

  const lines = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of s?.policies ?? []) m.set(p.line_code, p.line_name)
    return [...m.entries()]
  }, [s])
  const shown = (s?.policies ?? []).filter(p => !line || p.line_code === line)
  const policy = s?.policies.find(p => p.id === policyId) ?? null
  const path = s?.group && company.id === s.company?.id
    ? pathLabel(filingPath({ group: s.group, policy: policy ? { line_code: policy.line_code, insurer: policy.insurer, start_date: policy.start_date } : null, docType }))
    : null

  async function file() {
    if (!company.id) { setError('Choose the company from the list.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/filing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(ref.attachmentId ? { attachment_id: ref.attachmentId } : { document_id: ref.documentId }), company_id: company.id, policy_id: policyId || null, doc_type: docType }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not file it.')
      setFiled(d.document)
      onFiled?.(d.document)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const duplicate = filed?.status === 'ignored' && !!filed.drive_url
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader><DialogTitle>File to Drive</DialogTitle></DialogHeader>
        {!s && !error && <p className="m-0 text-body text-trs-muted">Reading the file…</p>}
        {s && !filed && (
          <form onSubmit={e => { e.preventDefault(); void file() }} className="flex flex-col gap-3">
            <Field label="File"><p className="m-0 text-body text-trs-ink break-words">{s.file.name}</p></Field>
            {s.document?.status === 'filed' && (
              <p className="m-0 text-small text-trs-muted">
                In Drive{s.document.filed_at ? ` since ${fmtDate(s.document.filed_at)}` : ''}{s.document.filed_by ? ` · ${s.document.filed_by}` : ''}. Filing again moves it; the link stays the same.
              </p>
            )}
            <CompanyField value={company} onChange={pickCompany} listId="filing-company-options" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Line">
                <SelectBox label="Line" size="md" value={line} onChange={v => { setLine(v); setPolicyId(NO_POLICY) }} disabled={!lines.length}
                  options={[{ value: ALL_LINES, label: lines.length ? 'Every line' : 'No policies' }, ...lines.map(([code, name]) => ({ value: code, label: name }))]} />
              </Field>
              <Field label="Type">
                <SelectBox label="Type" size="md" value={docType} onChange={setDocType} options={DOC_TYPES.map(t => ({ value: t.slug, label: t.label }))} />
              </Field>
            </div>
            <Field label="Policy">
              <SelectBox label="Policy" size="md" value={policyId} onChange={setPolicyId} options={[
                { value: NO_POLICY, label: 'No policy · To sort' },
                ...shown.map(p => ({ value: p.id, label: [p.insurer, p.label, p.start_date ? `${fmtDate(p.start_date)} to ${p.end_date ? fmtDate(p.end_date) : 'open'}` : null, p.policy_number].filter(Boolean).join(' · ') })),
              ]} />
            </Field>
            <Field label="Plan year"><p className="m-0 text-body text-trs-ink">{policy?.plan_year ?? '—'}</p></Field>
            <Field label="Saves to"><p className="m-0 text-small text-trs-ink break-words font-mono">{path ?? '—'}</p></Field>
            {error && <p className="m-0 text-small text-trs-neg" role="alert">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
              <Btn type="submit" level="primary" loading={saving} disabled={!company.id}>File</Btn>
            </div>
          </form>
        )}
        {!s && error && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>
            <div className="flex justify-end"><Btn level="tertiary" onClick={onClose}>Close</Btn></div>
          </div>
        )}
        {filed && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-body text-trs-ink" role="status">{duplicate ? 'The same file is already in Drive.' : `Filed to ${path ?? 'Drive'}`}</p>
            <div className="flex justify-end gap-2">
              {filed.drive_url && <a className="inline-flex items-center h-9 px-3 text-body text-trs-ink underline underline-offset-4" href={filed.drive_url} target="_blank" rel="noopener noreferrer">Open in Drive</a>}
              <Btn level="primary" onClick={onClose}>Done</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
