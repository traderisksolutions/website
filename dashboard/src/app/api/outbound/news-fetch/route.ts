import { NextRequest, NextResponse } from 'next/server'

// POST /api/outbound/news-fetch
// Body: { industry, locations: string[], newsUrl?: string }
// Returns: { headline, summary, url, source }
export async function POST(req: NextRequest) {
  try {
    const { industry, locations, newsUrl } = await req.json()

    const geminiKey = process.env.GEMINI_API_KEY_NEWS
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_NEWS not configured' }, { status: 500 })

    let headline: string | null = null
    let summary:  string | null = null
    let url:      string | null = newsUrl ?? null
    let source:   string | null = null

    if (newsUrl) {
      // User provided a URL — extract headline + summary from the article
      const prompt =
        `Read this article URL and extract: headline, a 2-3 sentence summary relevant to business insurance needs, and the source publication name. ` +
        `URL: ${newsUrl}\n\n` +
        `Return ONLY valid JSON: {"headline": "...", "summary": "...", "source": "..."}`

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            tools:    [{ googleSearch: {} }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      )

      if (res.ok) {
        const data    = await res.json()
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
        try {
          const parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
          headline = parsed.headline ?? null
          summary  = parsed.summary  ?? null
          source   = parsed.source   ?? null
        } catch { /* keep nulls */ }
      }
    } else {
      // Auto-fetch: find relevant insurance-angle news for the industry + location
      const locationStr = Array.isArray(locations) && locations.length > 0
        ? locations.join(' and ')
        : 'Singapore'

      const prompt =
        `Search Google News for real news articles published in the last 7 days about the "${industry}" industry in ${locationStr}. ` +
        `Find stories where a business faced a loss, risk, or disruption that business insurance (property, liability, cyber, workmen, or trade credit) could have helped mitigate. ` +
        `Examples: fire at warehouse, cyber attack on retailer, employee injury at construction site, cargo loss, business disruption. ` +
        `Return the single most relevant and recent story as JSON: {"headline": "...", "summary": "2-3 sentences explaining what happened and how insurance could have helped", "url": "...", "source": "publication name"}`

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            tools:    [{ googleSearch: {} }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      )

      if (res.ok) {
        const data    = await res.json()
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
        try {
          const parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
          headline = parsed.headline ?? null
          summary  = parsed.summary  ?? null
          url      = parsed.url      ?? null
          source   = parsed.source   ?? null
        } catch { /* keep nulls */ }
      }
    }

    if (!headline) {
      return NextResponse.json({ error: 'Could not fetch relevant news' }, { status: 422 })
    }

    return NextResponse.json({ headline, summary, url, source })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
