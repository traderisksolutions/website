const SB_URL  = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const NETROWS = 'https://api.netrows.com/v1'

export interface AgentEvent {
  step:            number
  status:          'running' | 'done' | 'error'
  message:         string
  count?:          number
  companiesFound?: number
  leadsTotal?:     number
}

export interface AgentOptions {
  query:         string
  roles?:        string[]
  maxCompanies?: number
  onEvent?:      (e: AgentEvent) => void
}

export interface AgentResult {
  companiesFound: number
  leadsTotal:     number
  error?:         string
}

interface GoogleResult  { url: string; title: string; description: string }
interface CompanyExtract { name: string; domain: string | null }
interface LiCompany {
  id:           string | null
  name:         string
  universalName: string | null
  linkedinUrl:  string | null
  tagline:      string | null
  description:  string | null
  staffCount:   number | null
  city:         string | null
  country:      string | null
  logo:         string | null
  website:      string | null
}
type Person = { fullName?: string; headline?: string; profileURL?: string; username?: string; profilePicture?: string; location?: string }

// ── Main agent ──────────────────────────────────────────────────────────────

export async function runOutboundAgent(opts: AgentOptions): Promise<AgentResult> {
  const { query, roles = ['CEO', 'CTO', 'Founder'], maxCompanies = 8, onEvent } = opts
  const emit = (e: AgentEvent) => onEvent?.(e)
  let companiesFound = 0
  let leadsTotal     = 0

  try {
    // Step 1 — Google search
    emit({ step: 1, status: 'running', message: 'Searching the web…' })
    const googleResults = await searchGoogle(query)
    emit({ step: 1, status: 'done', message: `${googleResults.length} web results`, count: googleResults.length })

    if (!googleResults.length) {
      emit({ step: -1, status: 'error', message: 'No web results — try a broader query.' })
      return { companiesFound: 0, leadsTotal: 0, error: 'No Google results' }
    }

    // Step 2 — AI extract companies
    emit({ step: 2, status: 'running', message: 'AI extracting company names…' })
    const companies = await extractCompanies(googleResults, query)
    emit({ step: 2, status: 'done', message: `${companies.length} companies identified`, count: companies.length })

    if (!companies.length) {
      emit({ step: -1, status: 'error', message: 'Could not extract companies — try a more specific query.' })
      return { companiesFound: 0, leadsTotal: 0, error: 'No companies extracted' }
    }

    // Step 3 — LinkedIn lookup + stakeholders
    emit({ step: 3, status: 'running', message: 'Looking up companies on LinkedIn…' })

    for (const co of companies.slice(0, maxCompanies)) {
      let liCo: LiCompany | null = null
      if (co.domain) liCo = await lookupByDomain(co.domain)
      if (!liCo)     liCo = await lookupByName(co.name)
      if (!liCo) continue

      companiesFound++
      await saveCompany(liCo)
      leadsTotal++
      emit({ step: 3, status: 'running', message: `Found ${liCo.name}`, companiesFound, leadsTotal })

      for (const role of roles.slice(0, 2)) {
        const people = await findStakeholders(liCo.name, role)
        for (const person of people.slice(0, 2)) {
          await savePerson(person, liCo.name)
          leadsTotal++
        }
      }
    }

    emit({ step: 4, status: 'done', message: `Done! ${leadsTotal} leads saved to CRM`, companiesFound, leadsTotal })
    return { companiesFound, leadsTotal }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Agent failed'
    emit({ step: -1, status: 'error', message: error })
    return { companiesFound, leadsTotal, error }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function searchGoogle(query: string): Promise<GoogleResult[]> {
  try {
    const res = await fetch(
      `${NETROWS}/google/search?query=${encodeURIComponent(query)}&region=SG`,
      { headers: { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch { return [] }
}

async function extractCompanies(results: GoogleResult[], query: string): Promise<CompanyExtract[]> {
  const prompt = `Extract target companies from these Google search results for the query: "${query}"

Results:
${results.map(r => `Title: ${r.title}\nURL: ${r.url}\nDesc: ${r.description}`).join('\n---\n')}

Return a JSON array of actual target companies (exclude news sites, directories, or listicle articles unless they ARE the searched company).
Format: [{"name": "Company Name", "domain": "company.com"}] — use null for domain if unclear.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
        }),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    return JSON.parse(text)
  } catch { return [] }
}

async function lookupByDomain(domain: string): Promise<LiCompany | null> {
  try {
    const res = await fetch(
      `${NETROWS}/companies/by-domain?domain=${encodeURIComponent(domain)}`,
      { headers: { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const c = data.company
    if (!c) return null
    return {
      id:           String(c.id ?? ''),
      name:         c.name,
      universalName: c.username ?? c.universalName ?? null,
      linkedinUrl:  c.linkedinUrl ?? (c.username ? `https://www.linkedin.com/company/${c.username}` : null),
      tagline:      c.tagline ?? null,
      description:  null,
      staffCount:   c.employeeCount ?? null,
      city:         null,
      country:      null,
      logo:         null,
      website:      null,
    }
  } catch { return null }
}

async function lookupByName(name: string): Promise<LiCompany | null> {
  try {
    const p = new URLSearchParams({
      keyword: name, locations: '102454443',
      companySizes: 'A,B,C,D,E', hasJobs: 'false', industries: '43', page: '1',
    })
    const res = await fetch(
      `${NETROWS}/companies/search?${p}`,
      { headers: { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` } }
    )
    if (!res.ok) return null
    const data  = await res.json()
    const first = data.data?.items?.[0]
    if (!first) return null
    return {
      id:           String(first.id),
      name:         first.name,
      universalName: first.universalName ?? null,
      linkedinUrl:  first.linkedinURL ?? null,
      tagline:      first.tagline ?? null,
      description:  null,
      staffCount:   null,
      city:         null,
      country:      null,
      logo:         first.logo ?? null,
      website:      null,
    }
  } catch { return null }
}

async function findStakeholders(companyName: string, role: string): Promise<Person[]> {
  try {
    const p = new URLSearchParams({ company: companyName, keywordTitle: role, start: '0' })
    const res = await fetch(
      `${NETROWS}/people/search?${p}`,
      { headers: { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.data?.items ?? []
  } catch { return [] }
}

async function saveCompany(c: LiCompany) {
  await sbPost({
    record_type:         'company',
    source:              'company_search',
    linkedin_url:        c.linkedinUrl,
    username:            c.universalName,
    full_name:           c.name,
    headline:            c.tagline,
    company_tagline:     c.tagline,
    company_description: c.description,
    employee_count:      c.staffCount,
    headquarters:        [c.city, c.country].filter(Boolean).join(', ') || null,
    logo_url:            c.logo,
    website:             c.website,
    raw_payload:         c,
  })
}

async function savePerson(p: Person, company: string) {
  await sbPost({
    record_type:     'person',
    source:          'people_search',
    linkedin_url:    p.profileURL ?? null,
    username:        p.username ?? null,
    full_name:       p.fullName ?? null,
    headline:        p.headline ?? null,
    profile_picture: p.profilePicture ?? null,
    location:        p.location ?? null,
    current_company: company,
    raw_payload:     p,
  })
}

async function sbPost(row: Record<string, unknown>) {
  const k = process.env.SUPABASE_SERVICE_KEY!
  await fetch(`${SB_URL}/rest/v1/outbound_leads?on_conflict=linkedin_url`, {
    method: 'POST',
    headers: {
      apikey:          k,
      Authorization:   `Bearer ${k}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  })
}
