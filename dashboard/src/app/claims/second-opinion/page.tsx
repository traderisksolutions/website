'use client'

/**
 * Claim second opinion (corpcover.com). Process, test phase from 22 Oct 2026:
 * client pays on Stripe → replies to our email with documents → upload them here and run the
 * review → read and check the report → send the PDF in the same email thread within 24 hours of
 * receiving the documents → a broker follows up in that thread.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Chip, Empty, SectionCard, Spinner } from '@/components/crm/primitives'

type Verdict = 'supported' | 'not_supported' | 'unclear'
type Report = {
  generated_at: string; model: string; summary: string; overall: string
  files: { name: string; bytes: number }[]
  reasons: { reason: string; clause_ref: string; clause_quote: string; verdict: Verdict; reasoning: string; question_for_insurer: string; quote_verified?: boolean | null }[]
}
type Intake = {
  id: string; status: string; contact_name: string | null; email: string | null; phone: string | null; created_at: string
  answers: Record<string, unknown> & { second_opinion?: Report }
}

const SLA_H = 24
const VERDICT: Record<Verdict, string> = { supported: 'Supported', not_supported: 'Not supported', unclear: 'Unclear' }
const STEPS = [
  'Confirm payment in Stripe (client reference = request id).',
  'Client replies to our email with the policy, schedule and insurer letter.',
  'Upload the documents here and run the review.',
  'Read every finding. Check any quote marked "not found".',
  `Send the PDF in the same email thread within ${SLA_H} hours of receiving the documents.`,
  'A broker who did not sell the policy replies in that thread.',
]
const ago = (iso: string) => new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function ClaimSecondOpinionPage() {
  const [rows, setRows] = useState<Intake[] | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [runErr, setRunErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/claims/second-opinion', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setRows(j.intakes); setErr('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])

  const row = useMemo(() => rows?.find(r => r.id === sel) ?? null, [rows, sel])
  const report = row?.answers.second_opinion

  const run = async () => {
    if (!row || !files.length) return
    setBusy(true); setRunErr('')
    try {
      const fd = new FormData()
      fd.set('intakeId', row.id)
      files.forEach(f => fd.append('files', f))
      const r = await fetch('/api/claims/second-opinion', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setRows(rs => rs?.map(x => x.id === row.id ? { ...x, answers: { ...x.answers, second_opinion: j.report } } : x) ?? rs)
      setFiles([])
    } catch (e) { setRunErr(e instanceof Error ? e.message : 'The review failed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <h1 className="text-[22px] font-medium text-[#202124]">Claim second opinion</h1>
      <p className="mt-1 text-[13px] text-[#5f6368]">corpcover.com requests · PDF due {SLA_H} hours after the documents arrive</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <SectionCard title="Requests" padded={false}>
          {err && <p className="p-4 text-[13px] text-[#b3261e]">{err}</p>}
          {!rows && !err && <div className="p-4"><Spinner label="Loading" /></div>}
          {rows && !rows.length && <Empty>No claim requests yet.</Empty>}
          <ul>
            {rows?.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => { setSel(r.id); setFiles([]); setRunErr('') }}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-[#f8f9fa] ${sel === r.id ? 'bg-[#f1f3f4]' : ''}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-[#202124]">{r.contact_name || r.email}</span>
                    <Chip>{r.answers.second_opinion ? 'Report ready' : String(r.answers.plan ?? 'Claim')}</Chip>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-[#5f6368]">{String(r.answers.claim_type ?? '')} · {String(r.answers.insurer ?? '')} · {String(r.answers.market ?? 'SG')}</span>
                  <span className="block text-[12px] text-[#80868b]">{ago(r.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="grid content-start gap-6">
          {!row && (
            <SectionCard title="Process">
              <ol className="grid gap-2 text-[14px] text-[#3c4043]">{STEPS.map((s, i) => <li key={s}>{i + 1}. {s}</li>)}</ol>
            </SectionCard>
          )}

          {row && (
            <SectionCard title={row.contact_name || row.email || 'Claim'}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-3">
                {([['Email', row.email], ['Phone', row.phone], ['Plan', row.answers.plan], ['Claim', row.answers.claim_type], ['Status', row.answers.claim_status], ['Insurer', row.answers.insurer], ['Amount', row.answers.amount_claimed], ['Decision', row.answers.decision_date], ['Request id', row.id.slice(0, 8).toUpperCase()]] as [string, unknown][]).map(([k, v]) => (
                  <div key={k}><dt className="text-[12px] text-[#80868b]">{k}</dt><dd className="text-[#202124]">{v ? String(v) : '—'}</dd></div>
                ))}
              </dl>
              {row.answers.what_happened ? <p className="mt-4 whitespace-pre-wrap text-[13.5px] text-[#3c4043]">{String(row.answers.what_happened)}</p> : null}

              <div className="mt-6 rounded-[10px] border border-dashed border-[#dadce0] p-4">
                <label htmlFor="so-files" className="text-[13.5px] font-medium text-[#202124]">Documents from the client</label>
                <p className="text-[12.5px] text-[#5f6368]">Policy schedule, wording and the insurer&apos;s letter. PDF, PNG or JPG; up to 8 files, 4.4 MB in total.</p>
                <input id="so-files" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
                  onChange={e => setFiles(Array.from(e.target.files ?? []))} className="mt-3 block text-[13px]" />
                <div className="mt-3 flex items-center gap-3">
                  <Btn level="primary" onClick={run} disabled={!files.length || busy} loading={busy}>{report ? 'Run again' : 'Run review'}</Btn>
                  {busy && <span className="text-[12.5px] text-[#5f6368]">Reading the documents. This takes 1 to 3 minutes.</span>}
                </div>
                {runErr && <p role="alert" className="mt-2 text-[13px] text-[#b3261e]">{runErr}</p>}
              </div>
            </SectionCard>
          )}

          {row && report && (
            <SectionCard title="Report" actions={
              <div className="flex gap-2">
                <a className="text-[13px] text-[#1a73e8] hover:underline" href={`/api/claims/second-opinion/${row.id}/pdf`} target="_blank" rel="noopener">Preview PDF</a>
                <a className="text-[13px] text-[#1a73e8] hover:underline" href={`/api/claims/second-opinion/${row.id}/pdf?download=1`}>Download</a>
              </div>
            }>
              <p className="text-[12.5px] text-[#80868b]">{ago(report.generated_at)} · {report.model} · {report.files.map(f => f.name).join(', ')}</p>
              <p className="mt-3 text-[14px] text-[#202124]">{report.summary}</p>
              <ol className="mt-5 grid gap-5">
                {report.reasons.map((x, i) => (
                  <li key={i} className="grid gap-1.5 text-[13.5px]">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="font-medium text-[#202124]">{i + 1}. {x.reason}</b>
                      <Chip>{VERDICT[x.verdict]}</Chip>
                      {x.quote_verified === false && <Chip>Quote not found, check original</Chip>}
                      {x.quote_verified == null && x.clause_quote && <Chip>Quote not machine-checked</Chip>}
                    </span>
                    <span className="text-[12.5px] text-[#80868b]">{x.clause_ref}</span>
                    {x.clause_quote && <q className="border-l-2 border-[#dadce0] pl-3 italic text-[#3c4043]">{x.clause_quote}</q>}
                    <span className="text-[#3c4043]">{x.reasoning}</span>
                    <span className="text-[#5f6368]">Ask the insurer: {x.question_for_insurer}</span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
