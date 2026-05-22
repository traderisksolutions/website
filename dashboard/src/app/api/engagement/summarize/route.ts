import { NextRequest, NextResponse } from 'next/server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

interface MsgSnippet {
  direction: string
  from_address: string
  body_text: string
  sent_at: string
}

export async function POST(req: NextRequest) {
  try {
    const { contactName, company, topic, leadStatus, messages } =
      await req.json() as {
        contactName: string
        company:     string | null
        topic:       string | null
        leadStatus:  string
        messages:    MsgSnippet[]
      }

    const key = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

    const thread = messages
      .map(m => {
        const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
        const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        const body = (m.body_text || '').slice(0, 600)
        return `[${date}] ${who}:\n${body}`
      })
      .join('\n\n---\n\n')

    const prompt = `You are an AI assistant for Trade Risk Solutions, a Singapore insurance brokerage.

Analyse this email conversation and return a concise structured summary. Be factual — only reference what is actually in the thread.

Contact: ${contactName}${company ? ` (${company})` : ''}
Topic: ${topic || 'General enquiry'}
Current status: ${leadStatus}

EMAIL THREAD:
${thread}

Return your analysis in this exact format (use plain text, no markdown asterisks):

SUMMARY
[1–2 sentences describing what this conversation is about and where it stands]

STATUS
[One sentence on the current state of this conversation]

LAST MESSAGE
[Who sent the last message and what it said in one sentence]

NEXT ACTION
[The single most important thing TRS should do next]`

    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json()
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return NextResponse.json({ summary })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
