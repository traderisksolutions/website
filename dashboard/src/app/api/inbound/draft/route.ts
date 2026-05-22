import { NextRequest, NextResponse } from 'next/server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// POST /api/inbound/draft
// Body: { name, topic, message }
// Returns: { content }
export async function POST(req: NextRequest) {
  try {
    const { name, topic, message } =
      await req.json() as { name: string; topic?: string | null; message?: string | null }

    const geminiKey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_EMAIL_ANALYSIS not set' }, { status: 500 })

    const firstName = name.split(' ')[0] || 'there'

    const prompt = `You are an AI email assistant for Trade Risk Solutions (TRS), a Singapore-based commercial insurance brokerage.

A new lead has submitted an enquiry via the TRS website. Write a warm, professional first-contact reply email from TRS to this prospect.

The reply should:
- Open with "Hi ${firstName},"
- Acknowledge their enquiry warmly and confirm TRS has received it
- Briefly mention what TRS specialises in (commercial insurance in Singapore — trade credit, marine cargo, property, liability, employee benefits, etc.) only if relevant to their topic
- Let them know a specialist from the team will follow up within 1 business day
- If their topic mentions a specific insurance type, acknowledge it specifically
- End with "Best regards,\nTrade Risk Solutions"
- Be 3–5 sentences — concise and human, not corporate-sounding
- Do NOT include a subject line, just the email body

Prospect name: ${name}
Topic / enquiry type: ${topic || 'General insurance enquiry'}
Their message:
${message || '(No message provided)'}

Write only the email body.`

    const gemRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    })

    if (!gemRes.ok) {
      const err = await gemRes.text()
      return NextResponse.json({ error: `Gemini error: ${err}` }, { status: 502 })
    }

    const data    = await gemRes.json()
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!content) return NextResponse.json({ error: 'Gemini returned no content' }, { status: 502 })

    return NextResponse.json({ content })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
