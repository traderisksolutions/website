import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { UrlFilters } from '@/components/ui/url-filters'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Chip } from '@/components/crm/primitives'
import { sbTry, enc } from '@/lib/crm/db'
import { fmtDate } from '@/lib/crm/format'
import { docLabel } from '@/lib/documents/taxonomy'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; company_id: string | null; policy_id: string | null; doc_type: string; title: string | null; filename: string
  status: 'unfiled' | 'filed' | 'failed' | 'ignored'; insurer_name: string | null; policy_number: string | null
  received_at: string | null; created_at: string; drive_url: string | null
  companies: { company_name: string | null } | null
}
type View = 'recent' | 'unfiled' | 'failed' | 'all'
const VIEWS: { value: View; label: string }[] = [
  { value: 'recent', label: 'Filed' }, { value: 'unfiled', label: 'Not filed' }, { value: 'failed', label: 'Failed' }, { value: 'all', label: 'All' },
]
const STATUS: Record<Row['status'], { word: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  filed: { word: 'Filed', tone: 'green' }, unfiled: { word: 'Not filed', tone: 'amber' }, failed: { word: 'Failed', tone: 'red' }, ignored: { word: 'Ignored', tone: 'neutral' },
}
const LIMIT = 300

/** The data room across every client: newest first. A company's own documents live on its page. */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const sp = await searchParams
  const view = (VIEWS.some(v => v.value === sp.view) ? sp.view : 'recent') as View
  const q = (sp.q ?? '').trim()
  const filter: Record<View, string> = { recent: 'status=eq.filed', unfiled: 'status=eq.unfiled', failed: 'status=eq.failed', all: 'status=neq.ignored' }
  const like = enc(`*${q.replace(/[(),*]/g, ' ')}*`)
  const search = q ? `&or=(filename.ilike.${like},title.ilike.${like},policy_number.ilike.${like},insurer_name.ilike.${like})` : ''
  const rows = await sbTry<Row[]>(
    `policy_documents?select=id,company_id,policy_id,doc_type,title,filename,status,insurer_name,policy_number,received_at,created_at,drive_url,companies(company_name)&${filter[view]}${search}&order=created_at.desc&limit=${LIMIT}`,
    [],
  )

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 flex flex-col gap-5 min-w-0">
      <PageHeader title="Documents" meta={<>{rows.length}{rows.length === LIMIT ? '+' : ''} {rows.length === 1 ? 'document' : 'documents'}</>}>
        <UrlFilters<View> param="view" value={view} options={VIEWS} query={q} placeholder="File, policy no. or insurer" />
      </PageHeader>
      <Register label="Documents" minWidth={900}>
        <RegisterHead>
          <RegisterTh first>Document</RegisterTh>
          <RegisterTh>Type</RegisterTh>
          <RegisterTh>Client</RegisterTh>
          <RegisterTh>Insurer · policy no.</RegisterTh>
          <RegisterTh>Received</RegisterTh>
          <RegisterTh last>Status</RegisterTh>
        </RegisterHead>
        <tbody>
          {rows.length === 0 && <RegisterEmpty colSpan={6}>No documents in this view</RegisterEmpty>}
          {rows.map(r => (
            <RegisterRow key={r.id}>
              <RegisterCell first title={r.filename} primary={
                <a href={`/api/documents/${r.id}/file`} target="_blank" rel="noreferrer" className="text-trs-ink no-underline hover:underline">{r.title || r.filename}</a>
              } />
              <RegisterCell>{docLabel(r.doc_type)}</RegisterCell>
              <RegisterCell>{r.company_id ? <Link href={`/companies/${r.company_id}?tab=documents`} className="text-trs-ink no-underline hover:underline">{r.companies?.company_name ?? 'Unnamed client'}</Link> : '—'}</RegisterCell>
              <RegisterCell>{[r.insurer_name, r.policy_number].filter(Boolean).join(' · ') || '—'}</RegisterCell>
              <RegisterCell className="tabular-nums">{fmtDate(r.received_at ?? r.created_at)}</RegisterCell>
              <RegisterCell last><Chip tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.word ?? r.status}</Chip></RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
    </div>
  )
}
