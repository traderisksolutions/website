/**
 * GET /api/policies/lookup?policy_number=X[&company_id=&class_of_insurance=&period_end=]
 * Used by the debit note review form. Exact number first: a policy with this number that already
 * has a debit note tells the reviewer whether the same term is being billed again (endorsement)
 * or a new term (renewal). When nothing has that number, the company's policies are searched
 * for the master an endorsement belongs to — same base number (the "/E01"-style suffix
 * stripped), otherwise the one active policy with the same term end and class — so a mid-term
 * amendment attaches to its main policy and keeps that policy's renewal date.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { findMasterPolicy, hasEndorsementSuffix, type PolicyLike } from '@/lib/policies/endorsement'

type Row = PolicyLike & { id: string; start_date: string | null; end_date: string | null; policy_number: string | null; class_of_insurance: string | null }

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const q = req.nextUrl.searchParams
    const policyNumber = q.get('policy_number')?.trim() || null
    const companyId = q.get('company_id')?.trim() || null
    const classOfInsurance = q.get('class_of_insurance')?.trim() || null
    const periodEnd = q.get('period_end')?.trim() || null
    if (!policyNumber && !(companyId && (classOfInsurance || periodEnd))) return NextResponse.json(null)

    const respond = async (policy: Row, matchedBy: 'number' | 'base' | 'term') => {
      const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?policy_id=eq.${policy.id}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
      const hasDebitNotes = dnRes.ok && (await dnRes.json()).length > 0
      return NextResponse.json({ id: policy.id, policyNumber: policy.policy_number, classOfInsurance: policy.class_of_insurance, startDate: policy.start_date, endDate: policy.end_date, hasDebitNotes, matchedBy })
    }

    if (policyNumber) {
      const res = await fetch(`${SB_URL}/rest/v1/policies?policy_number=eq.${encodeURIComponent(policyNumber)}&select=id,policy_number,class_of_insurance,description,start_date,end_date&limit=1`, { headers: sbH(), cache: 'no-store' })
      const exact: Row | undefined = res.ok ? (await res.json())[0] : undefined
      if (exact) return respond(exact, 'number')
    }

    if (!companyId) return NextResponse.json(null)
    const custRes = await fetch(`${SB_URL}/rest/v1/customers?company_id=eq.${encodeURIComponent(companyId)}&select=policies(id,policy_number,class_of_insurance,description,start_date,end_date,status)`, { headers: sbH(), cache: 'no-store' })
    const customers: { policies: (Row & { status: string })[] | null }[] = custRes.ok ? await custRes.json() : []
    const policies = customers.flatMap(c => c.policies ?? []).filter(p => p.status === 'active')
    const master = findMasterPolicy({ policy_number: policyNumber, class_of_insurance: classOfInsurance, end_date: periodEnd }, policies)
    if (!master) return NextResponse.json(null)
    return respond(master, hasEndorsementSuffix(policyNumber) ? 'base' : 'term')
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
