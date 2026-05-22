import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

const ROLE_MAP: Record<string, string[]> = {
  api:         ['CTO', 'VP Engineering', 'Head of Product', 'Technical Lead', 'Product Manager'],
  assets:      ['CEO', 'COO', 'Managing Director', 'CFO', 'Operations Director'],
  liabilities: ['CEO', 'COO', 'Managing Director', 'CFO', 'Head of Risk', 'Head of Compliance'],
  workforce:   ['CEO', 'COO', 'HR Director', 'Chief People Officer', 'Head of HR'],
}

function sbHeaders(returnRepresentation = false) {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:          k,
    Authorization:   `Bearer ${k}`,
    'Content-Type':  'application/json',
    Prefer:          returnRepresentation ? 'return=representation' : 'return=minimal',
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sector, location, geoId, productType, cronPreference } = await req.json()
    if (!sector || !location || !geoId || !productType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const roles = ROLE_MAP[productType] ?? ['CEO', 'COO', 'Managing Director']
    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not configured' }, { status: 500 })

    // ── 1. Gemini with Google Search Grounding ──────────────────────────────
    const prompt =
      `Use Google Search to find 30 to 50 real companies in the "${sector}" industry located in ${location}. ` +
      `Return ONLY a valid JSON array of company name strings, no explanation, no markdown. ` +
      `Example: ["Grab", "Sea Limited", "Shopee"]`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools:    [{ googleSearch: {} }],
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      return NextResponse.json({ error: `Gemini error: ${err}` }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Parse — handle both clean JSON and markdown-wrapped JSON
    let companyNames: string[] = []
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(cleaned)
      companyNames = Array.isArray(parsed)
        ? parsed.filter((n: unknown) => typeof n === 'string' && n.trim())
        : []
    } catch {
      // Fallback: extract line-by-line
      companyNames = rawText
        .split('\n')
        .map(l => l.replace(/^[-*\d.)"\s]+/, '').replace(/[",]+$/, '').trim())
        .filter(l => l.length > 1 && l.length < 120)
        .slice(0, 50)
    }

    if (companyNames.length === 0) {
      return NextResponse.json({ error: 'Gemini returned no companies. Try a more specific sector.' }, { status: 422 })
    }

    // ── 2. Deduplicate against ob_company_dump + outbound_leads ────────────
    const [dumpRes, leadsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_company_dump?select=name`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/outbound_leads?select=current_company&record_type=eq.person`, { headers: sbHeaders() }),
    ])

    const dumpRows:  { name: string }[]             = dumpRes.ok  ? await dumpRes.json()  : []
    const leadsRows: { current_company: string }[]  = leadsRes.ok ? await leadsRes.json() : []

    const existingNames = new Set([
      ...(Array.isArray(dumpRows)  ? dumpRows.map(r => r.name.toLowerCase())                                  : []),
      ...(Array.isArray(leadsRows) ? leadsRows.map(r => r.current_company?.toLowerCase()).filter(Boolean) : []),
    ])

    const newCompanies = companyNames.filter(n => !existingNames.has(n.toLowerCase()))
    const skipped      = companyNames.length - newCompanies.length

    // ── 3. Save search log ─────────────────────────────────────────────────
    const logRes = await fetch(`${SB_URL}/rest/v1/ob_search_log`, {
      method:  'POST',
      headers: sbHeaders(true),
      body:    JSON.stringify({
        sector,
        location,
        geo_id:          geoId,
        product_type:    productType,
        roles_targeted:  roles,
        cron_preference: cronPreference ?? null,
        company_count:   newCompanies.length,
        status:          'completed',
      }),
    })
    if (!logRes.ok) return NextResponse.json({ error: 'Failed to save search log' }, { status: 500 })
    const [searchLog] = await logRes.json()

    // ── 4. Insert companies ────────────────────────────────────────────────
    if (newCompanies.length > 0) {
      await fetch(`${SB_URL}/rest/v1/ob_company_dump`, {
        method:  'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body:    JSON.stringify(
          newCompanies.map((name, i) => ({ search_id: searchLog.id, name, source_rank: i + 1 }))
        ),
      })
    }

    // ── 5. Return inserted companies ───────────────────────────────────────
    const companiesRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?search_id=eq.${searchLog.id}&order=source_rank.asc`,
      { headers: sbHeaders() }
    )
    const companies = companiesRes.ok ? await companiesRes.json() : []

    return NextResponse.json({
      searchId:   searchLog.id,
      companies:  Array.isArray(companies) ? companies : [],
      totalFound: companyNames.length,
      skipped,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
