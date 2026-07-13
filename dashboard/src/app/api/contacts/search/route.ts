/**
 * GET /api/contacts/search?q=term&limit=8
 * Typeahead for the reply-editor recipient fields (#2). Matches name OR email across
 * ALL contacts (clients + employees) so e.g. "cath" → Catherine Lim <catherine.lim@…>.
 * Employees are included and flagged so the UI can label them "Team".
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export type ContactSuggestion = {
  id:          string
  name:        string
  email:       string
  company:     string | null
  is_employee: boolean
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sp    = new URL(req.url).searchParams
    const q     = (sp.get('q') ?? '').trim()
    const limit = Math.min(Number(sp.get('limit') ?? 8), 20)
    if (q.length < 1) return NextResponse.json([])

    // Sanitise for a PostgREST or=() filter: strip characters that break the grammar.
    const like = `*${q.replace(/[(),*"]/g, ' ').trim()}*`
    const or   = ['first_name', 'last_name', 'email', 'company'].map(f => `${f}.ilike.${like}`).join(',')
    const select = 'id,first_name,last_name,email,company,is_employee'
    // Employees first, then most recent — staff are the common internal-email case.
    const url = `${SB_URL}/rest/v1/contacts?or=(${encodeURIComponent(or)})&email=not.is.null&select=${select}&order=is_employee.desc,created_at.desc&limit=${limit}`

    const res  = await fetch(url, { headers: sbH(), cache: 'no-store' })
    const rows = res.ok ? await res.json() : []

    const out: ContactSuggestion[] = (Array.isArray(rows) ? rows : []).map((c: Record<string, unknown>) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
      return {
        id:          String(c.id),
        name:        name || String(c.email ?? ''),
        email:       String(c.email ?? ''),
        company:     (c.company as string) || null,
        is_employee: !!c.is_employee,
      }
    })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
