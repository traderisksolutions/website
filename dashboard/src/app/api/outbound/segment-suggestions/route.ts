import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders }         from '@/lib/sb'
import { requireStaffOrCron }        from '@/lib/api-auth'

/**
 * GET /api/outbound/segment-suggestions
 *
 * Recommends which industries to target next via Apollo — deterministic, data-driven (no LLM
 * guessing about a real business decision), built from companies that have actually converted
 * (a `customers` row backed by ≥1 real `policies` row), never from Apollo/lead data alone.
 * Excludes any industry an active campaign's segment already targets (see
 * active-campaign-industries.ts, same exclusion the daily-lead-discovery cron respects) so
 * suggestions are always for genuinely new ground, not a duplicate of what's already running.
 *
 * A suggestion is never auto-applied — POST /api/outbound/segment-suggestions/approve is the
 * only thing that acts on one, and it only ever seeds a DRAFT campaign for a human to review,
 * write copy for, and activate through the existing campaign flow.
 */

interface WonCompany { id: string; name: string; industry: string | null }
interface LeadSignal { current_industry: string | null; employee_count: number | null; current_title: string | null }

export interface SegmentSuggestion {
  industry:          string
  wonCompanyCount:   number
  sampleCompanies:   string[]
  employeeMin:       number | null
  employeeMax:       number | null
  suggestedTitles:   string[]
  locations:         string[]
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    // 1. Companies with at least one real policy (won business), via customers.
    const custRes = await fetch(
      `${SB_URL}/rest/v1/customers?type=eq.company&company_id=not.is.null&select=id,company_id`,
      { headers: sbHeaders() }
    )
    const customers: { id: string; company_id: string }[] = custRes.ok ? await custRes.json() : []
    if (customers.length === 0) return NextResponse.json({ suggestions: [], reason: 'no_won_customers' })

    const custIds = customers.map(c => c.id)
    const policyRes = await fetch(
      `${SB_URL}/rest/v1/policies?customer_id=in.(${custIds.join(',')})&select=customer_id`,
      { headers: sbHeaders() }
    )
    const policyRows: { customer_id: string }[] = policyRes.ok ? await policyRes.json() : []
    const custIdsWithPolicy = new Set(policyRows.map(p => p.customer_id))
    const wonCompanyIds = Array.from(new Set(
      customers.filter(c => custIdsWithPolicy.has(c.id)).map(c => c.company_id)
    ))
    if (wonCompanyIds.length === 0) return NextResponse.json({ suggestions: [], reason: 'no_won_customers' })

    // 2. Resolve each won company's industry — prefer the company's own record, fall back to
    //    whatever an originating outbound lead's Apollo data said (companies.industry is a newer
    //    field that's mostly unpopulated for companies resolved via the lead/contact pipeline).
    const companiesRes = await fetch(
      `${SB_URL}/rest/v1/companies?id=in.(${wonCompanyIds.join(',')})&select=id,name,industry`,
      { headers: sbHeaders() }
    )
    const companies: WonCompany[] = companiesRes.ok ? await companiesRes.json() : []

    const missingIndustryIds = companies.filter(c => !c.industry).map(c => c.id)
    const leadSignalByCompany = new Map<string, LeadSignal[]>()
    if (missingIndustryIds.length > 0) {
      const contactsRes = await fetch(
        `${SB_URL}/rest/v1/contacts?company_id=in.(${missingIndustryIds.join(',')})&outbound_lead_id=not.is.null&select=company_id,outbound_lead_id`,
        { headers: sbHeaders() }
      )
      const contactRows: { company_id: string; outbound_lead_id: string }[] = contactsRes.ok ? await contactsRes.json() : []
      const leadIds = Array.from(new Set(contactRows.map(c => c.outbound_lead_id)))
      if (leadIds.length > 0) {
        const leadsRes = await fetch(
          `${SB_URL}/rest/v1/outbound_leads?id=in.(${leadIds.join(',')})&select=id,current_industry,employee_count,current_title`,
          { headers: sbHeaders() }
        )
        const leadRows: (LeadSignal & { id: string })[] = leadsRes.ok ? await leadsRes.json() : []
        const leadById = new Map(leadRows.map(l => [l.id, l]))
        for (const c of contactRows) {
          const signal = leadById.get(c.outbound_lead_id)
          if (!signal) continue
          if (!leadSignalByCompany.has(c.company_id)) leadSignalByCompany.set(c.company_id, [])
          leadSignalByCompany.get(c.company_id)!.push(signal)
        }
      }
    }

    // 3. Aggregate by resolved industry.
    type Agg = { displayName: string; companies: Set<string>; sampleNames: string[]; employeeCounts: number[]; titles: string[] }
    const byIndustry = new Map<string, Agg>()
    for (const c of companies) {
      const signals = leadSignalByCompany.get(c.id) ?? []
      const industry = c.industry?.trim() || signals.find(s => s.current_industry?.trim())?.current_industry?.trim() || null
      if (!industry) continue
      const key = industry.toLowerCase()
      if (!byIndustry.has(key)) byIndustry.set(key, { displayName: industry, companies: new Set(), sampleNames: [], employeeCounts: [], titles: [] })
      const agg = byIndustry.get(key)!
      if (!agg.companies.has(c.id)) {
        agg.companies.add(c.id)
        if (agg.sampleNames.length < 3) agg.sampleNames.push(c.name)
      }
      for (const s of signals) {
        if (s.employee_count != null) agg.employeeCounts.push(s.employee_count)
        if (s.current_title?.trim()) agg.titles.push(s.current_title.trim())
      }
    }

    if (byIndustry.size === 0) return NextResponse.json({ suggestions: [], reason: 'no_industry_data' })

    // 4. Exclude industries already targeted by an active campaign's segment.
    const activeCampRes = await fetch(`${SB_URL}/rest/v1/ob_campaigns?status=eq.active&select=id`, { headers: sbHeaders() })
    const activeCampaigns: { id: string }[] = activeCampRes.ok ? await activeCampRes.json() : []
    const alreadyTargeted = new Set<string>()
    if (activeCampaigns.length > 0) {
      const segRes = await fetch(
        `${SB_URL}/rest/v1/ob_campaign_segments?campaign_id=in.(${activeCampaigns.map(c => c.id).join(',')})&is_active=eq.true&select=industry`,
        { headers: sbHeaders() }
      )
      const segs: { industry: string[] | null }[] = segRes.ok ? await segRes.json() : []
      for (const s of segs) for (const i of s.industry ?? []) alreadyTargeted.add(i.toLowerCase())
    }

    // 5. Rank by won-company count, most common first; top 5 not already targeted.
    const suggestions: SegmentSuggestion[] = Array.from(byIndustry.entries())
      .filter(([key]) => !alreadyTargeted.has(key))
      .sort((a, b) => b[1].companies.size - a[1].companies.size)
      .slice(0, 5)
      .map(([, agg]) => {
        const counts = agg.employeeCounts.sort((a, b) => a - b)
        const titleFreq = new Map<string, number>()
        for (const t of agg.titles) titleFreq.set(t, (titleFreq.get(t) ?? 0) + 1)
        const topTitles = Array.from(titleFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t)
        return {
          industry:        agg.displayName,
          wonCompanyCount: agg.companies.size,
          sampleCompanies: agg.sampleNames,
          employeeMin:     counts.length ? counts[0] : null,
          employeeMax:     counts.length ? counts[counts.length - 1] : null,
          suggestedTitles: topTitles,
          locations:       ['Singapore', 'Hong Kong'],
        }
      })

    return NextResponse.json({ suggestions })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
