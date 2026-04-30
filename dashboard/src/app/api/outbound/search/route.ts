import { NextRequest, NextResponse } from 'next/server'

const NETROWS = 'https://api.netrows.com/v1'

function netrowsHeaders() {
  return { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` }
}

// POST /api/outbound/search
// Body: { type: 'people'|'company', ...criteria }
// Returns raw Netrows response — caller decides what to save
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, ...criteria } = body

    let url: string
    if (type === 'people') {
      const p = new URLSearchParams()
      if (criteria.keywordTitle) p.set('keywordTitle', criteria.keywordTitle)
      if (criteria.keywords)     p.set('keywords',     criteria.keywords)
      if (criteria.geo)          p.set('geo',          criteria.geo)
      if (criteria.company)      p.set('company',      criteria.company)
      if (criteria.firstName)    p.set('firstName',    criteria.firstName)
      if (criteria.lastName)     p.set('lastName',     criteria.lastName)
      p.set('start', String(criteria.start ?? 0))
      url = `${NETROWS}/people/search?${p}`
    } else {
      if (!criteria.keyword) {
        return NextResponse.json({ error: 'keyword required for company search' }, { status: 400 })
      }
      const p = new URLSearchParams()
      p.set('keyword',      criteria.keyword)
      p.set('locations',    criteria.locations    ?? '102454443')
      p.set('companySizes', criteria.companySizes ?? 'B,C,D,E')
      p.set('hasJobs',      String(criteria.hasJobs ?? false))
      p.set('industries',   criteria.industries   ?? '43')
      p.set('page',         String(criteria.page  ?? 1))
      url = `${NETROWS}/companies/search?${p}`
    }

    const res = await fetch(url, { headers: netrowsHeaders() as HeadersInit })
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: `Netrows ${res.status}: ${body}` }, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
