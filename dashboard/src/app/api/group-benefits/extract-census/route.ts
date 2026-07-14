/**
 * POST /api/group-benefits/extract-census   { thread_id }
 * Reads the spreadsheet attachment(s) a client emailed (xlsx/csv — already parsed to CSV
 * text at ingest) and uses Gemini to structure them into a census: name, category,
 * relationship, dob, age. Powers the "GB Quote" dock tab in Engagement.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { GEMINI_FLASH, geminiUrl }   from '@/lib/gemini-models'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type Member = { name: string; category: string; relationship: string; dob: string | null; age: number | null }

const isSheet = (f: string, m: string) =>
  /sheet|excel|csv|officedocument\.spreadsheet/i.test(m || '') || /\.(xlsx|xls|csv)$/i.test(f || '')

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { thread_id } = await req.json() as { thread_id?: string }
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    const aRes = await fetch(`${SB_URL}/rest/v1/email_attachments?thread_id=eq.${thread_id}&parsed_text=not.is.null&select=filename,mime_type,parsed_text&order=created_at.asc`, { headers: sbH(), cache: 'no-store' })
    const atts: { filename: string; mime_type: string; parsed_text: string }[] = aRes.ok ? await aRes.json() : []
    const sheets = atts.filter(a => isSheet(a.filename, a.mime_type) && (a.parsed_text ?? '').trim().length > 10)
    // De-dupe by filename (same doc appears on multiple messages).
    const seen = new Set<string>()
    const unique = sheets.filter(s => (seen.has(s.filename) ? false : (seen.add(s.filename), true)))
    if (unique.length === 0) return NextResponse.json({ members: [], files: [], error: 'No spreadsheet (xlsx/csv) census attachment found on this thread.' })

    const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!key) return NextResponse.json({ error: 'GEMINI key not set' }, { status: 500 })

    const corpus = unique.map(s => `# FILE: ${s.filename}\n${(s.parsed_text ?? '').slice(0, 20000)}`).join('\n\n')
    const prompt = `You are extracting a group-insurance employee census from spreadsheet data (already converted to CSV). Column names/order vary per client — map them yourself.
Return ONLY JSON: { "members": [{ "name": string, "category": string, "relationship": "self"|"spouse"|"child", "dob": "YYYY-MM-DD"|null, "age": number|null }] }
RULES:
- One row per person, including dependents (spouse/children) if present.
- relationship: the employee = "self"; map "employee/staff/principal" to "self". Spouse/wife/husband -> "spouse"; child/son/daughter -> "child". Default "self" if unclear.
- category = the plan grade/tier/category column if present (e.g. Manager, Exec, Staff), else "Default".
- dob: normalise any date to YYYY-MM-DD. If only an age is given, set age and dob=null. Never invent a DOB.
- Ignore header/total/blank rows.

DATA:
${corpus}`

    const gRes = await fetch(`${geminiUrl(GEMINI_FLASH)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 16000 } }),
    })
    if (!gRes.ok) return NextResponse.json({ error: `Gemini ${gRes.status}` }, { status: 502 })
    const gj = await gRes.json()
    const text = gj?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    let members: Member[] = []
    try {
      const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))
      members = Array.isArray(o.members) ? o.members : []
    } catch { /* leave empty */ }

    return NextResponse.json({ members, files: unique.map(u => u.filename) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
