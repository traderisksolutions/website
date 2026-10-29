/**
 * GET /api/insurers/[id]/threads → the insurer and every email thread it takes part in, with the
 * client, the suggested or confirmed policy, and the client's policies to choose from.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enc, sbTry } from '@/lib/crm/db'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { sameInsurer } from '@/lib/insurers/threads'

export const dynamic = 'force-dynamic'

type Row = { id: string; thread_id: string; client_company_id: string | null; policy_id: string | null; via: string; policy_status: string; policy_how: string | null; confidence: number | null; reason: string | null; last_message_at: string | null }
type Pol = { id: string; company_id: string; label: string | null; class_of_insurance: string | null; policy_number: string | null; insurer: string | null; start_date: string | null }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Insurer id is not valid')
  try {
    const [insurer] = await sbTry<{ id: string; company_name: string; domain: string | null }[]>(`companies?id=eq.${enc(id)}&select=id,company_name,domain&limit=1`, [])
    if (!insurer) return fail('Insurer not found', 404)
    const rows = await sbTry<Row[]>(`thread_insurers?insurer_company_id=eq.${enc(id)}&select=id,thread_id,client_company_id,policy_id,via,policy_status,policy_how,confidence,reason,last_message_at&order=last_message_at.desc.nullslast&limit=1000`, [])
    const tIds = [...new Set(rows.map(r => r.thread_id))], cIds = [...new Set(rows.map(r => r.client_company_id).filter(Boolean) as string[])]
    const [threads, clients, pols] = await Promise.all([
      tIds.length ? sbTry<{ id: string; subject: string | null; display_subject: string | null }[]>(`email_threads?id=in.(${tIds.map(enc).join(',')})&select=id,subject,display_subject`, []) : [],
      cIds.length ? sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${cIds.map(enc).join(',')})&select=id,company_name`, []) : [],
      cIds.length ? sbTry<Pol[]>(`policies?company_id=in.(${cIds.map(enc).join(',')})&select=id,company_id,label,class_of_insurance,policy_number,insurer,start_date&order=start_date.desc.nullslast`, []) : [],
    ])
    const tm = new Map(threads.map(t => [t.id, t.display_subject || t.subject])), cm = new Map(clients.map(c => [c.id, c.company_name]))
    const label = (p: Pol) => [p.label ?? p.class_of_insurance ?? 'Policy', p.policy_number, p.insurer].filter(Boolean).join(' · ')
    return NextResponse.json({
      insurer,
      rows: rows.map(r => {
        const options = pols.filter(p => p.company_id === r.client_company_id)
          .sort((a, b) => Number(sameInsurer(b.insurer, insurer.company_name)) - Number(sameInsurer(a.insurer, insurer.company_name)))
          .map(p => ({ id: p.id, label: label(p), same_insurer: sameInsurer(p.insurer, insurer.company_name) }))
        return { ...r, subject: tm.get(r.thread_id) ?? '(no subject)', client: r.client_company_id ? { id: r.client_company_id, name: cm.get(r.client_company_id) ?? 'Company' } : null, options }
      }),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
