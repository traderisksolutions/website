/**
 * GET /api/analytics/earnings → every debit and credit note, normalised for the Earnings page:
 * client name, insurer, class of insurance (from the policy), premium and commission.
 *
 * Aggregation happens in the page (src/lib/analytics/earnings.ts) so a filter change is instant;
 * the register is small enough to send whole. Staff only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/postgrest-all'
import type { Note } from '@/lib/analytics/earnings'
import { normInsurer } from '@/lib/insurers'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

type Raw = { id: string; debit_note_no: string; issue_date: string | null; company_id: string | null; insurer: string | null
             policy_id: string | null; event_type: string | null; gross_amount: number | string | null
             commission: number | string | null; currency: string | null; status: string | null; paid_amount: number | string | null }

const num = (v: unknown): number | null => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v))

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try {
    const [raw, companies, policies] = await Promise.all([
      fetchAllRows<Raw>(`${SB_URL}/rest/v1/debit_notes?select=id,debit_note_no,issue_date,company_id,insurer,policy_id,event_type,gross_amount,commission,currency,status,paid_amount`, sbH()),
      fetchAllRows<{ id: string; company_name: string }>(`${SB_URL}/rest/v1/companies?select=id,company_name`, sbH()),
      fetchAllRows<{ id: string; class_of_insurance: string | null; policy_number: string | null; end_date: string | null }>(`${SB_URL}/rest/v1/policies?select=id,class_of_insurance,policy_number,end_date`, sbH()),
    ])
    const nameOf = new Map(companies.map(c => [c.id, c.company_name]))
    const classOf = new Map(policies.map(p => [p.id, p.class_of_insurance]))
    const policyOf = new Map(policies.map(p => [p.id, p]))
    const undated = raw.filter(r => !r.issue_date).length

    // One spelling per insurer and per class. The register holds "Chubb Insurance Singapore
    // Limited", "…Ltd" and "Chubb"; "PERFORMANCE BOND" and "Performance Bond". Each group shows
    // its most used spelling, preferring one not in capitals.
    const canonical = (values: string[], keyOf: (s: string) => string) => {
      const groups = new Map<string, Map<string, number>>()
      for (const v of values) {
        const k = keyOf(v); const g = groups.get(k) ?? new Map<string, number>()
        g.set(v, (g.get(v) ?? 0) + 1); groups.set(k, g)
      }
      const pick = new Map<string, string>()
      groups.forEach((g, k) => {
        const best = Array.from(g.entries()).sort((a, b) =>
          Number(a[0] === a[0].toUpperCase()) - Number(b[0] === b[0].toUpperCase()) || b[1] - a[1] || b[0].length - a[0].length)[0][0]
        pick.set(k, best)
      })
      return (v: string) => pick.get(keyOf(v)) ?? v
    }
    const insurerKey = (s: string) => {
      const n = normInsurer(s)
      // A bare brand ("chubb") joins the longer name it starts.
      const longer = rawInsurers.map(normInsurer).filter(x => x !== n && x.startsWith(n) && n.length >= 3).sort((a, b) => a.length - b.length)[0]
      return longer ?? n
    }
    const rawInsurers = raw.map(r => (r.insurer ?? 'Unknown insurer').trim())
    const insurerName = canonical(rawInsurers, insurerKey)
    const rawClasses = policies.map(p => p.class_of_insurance?.trim()).filter((c): c is string => !!c)
    const className = canonical(rawClasses, s => s.toLowerCase().replace(/\s+/g, ' '))
    const notes: Note[] = raw.filter(r => r.issue_date).map(r => ({
      id: r.id, no: r.debit_note_no, issueDate: r.issue_date!.slice(0, 10),
      companyId: r.company_id, companyName: (r.company_id && nameOf.get(r.company_id)) || 'No client on file',
      insurer: insurerName((r.insurer ?? 'Unknown insurer').trim()),
      className: (() => { const c = r.policy_id && classOf.get(r.policy_id)?.trim(); return c ? className(c) : null })(),
      policyId: r.policy_id, eventType: r.event_type,
      premium: num(r.gross_amount) ?? 0, commission: num(r.commission), currency: (r.currency ?? 'SGD').toUpperCase(),
      policyNumber: (r.policy_id && policyOf.get(r.policy_id)?.policy_number) || null,
      policyEnd: (r.policy_id && policyOf.get(r.policy_id)?.end_date?.slice(0, 10)) || null,
    }))
    return NextResponse.json({
      notes, undated,
      paidRecorded: raw.filter(r => (num(r.paid_amount) ?? 0) > 0 || (r.status && r.status !== 'unpaid')).length,
      companiesOnFile: companies.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
