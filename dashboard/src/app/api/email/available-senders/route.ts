import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SB_URL            = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const DEFAULT_OPS_EMAIL = 'operations@trade-risksol.com'

export type Sender = {
  email:    string
  label:    string
  type:     'shared' | 'personal'
  verified: boolean
}

type SharedSenderEntry = { email: string; verified?: boolean }

// GET /api/email/available-senders
// Returns the list of From addresses the current employee can send from:
// - Shared addresses from app_settings key 'shared_email_senders' (JSON array)
//   Falls back to legacy 'reply_from_email' if list not configured.
// - Their own @trade-risksol.com address (only if they've connected their Gmail in Settings)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const k = process.env.SUPABASE_SERVICE_KEY!
  const h = { apikey: k, Authorization: `Bearer ${k}` }

  const [sharedRes, legacyRes, profileRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/app_settings?key=eq.shared_email_senders&select=value&limit=1`, { headers: h, cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/app_settings?key=eq.reply_from_email&select=value&limit=1`,     { headers: h, cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=gmail_email&limit=1`, { headers: h, cache: 'no-store' }),
  ])

  const sharedRows = sharedRes.ok ? await sharedRes.json() : []
  const legacyRows = legacyRes.ok ? await legacyRes.json() : []
  const profiles   = profileRes.ok ? await profileRes.json() : []

  // Build shared sender list
  let sharedEntries: SharedSenderEntry[] = []
  const sharedRaw = Array.isArray(sharedRows) ? sharedRows[0]?.value : null
  if (typeof sharedRaw === 'string') {
    try { sharedEntries = JSON.parse(sharedRaw) } catch { /* fall through */ }
  }

  // Fall back to legacy reply_from_email if no list configured
  if (sharedEntries.length === 0) {
    const legacyEmail = Array.isArray(legacyRows) && legacyRows[0]?.value
      ? String(legacyRows[0].value)
      : DEFAULT_OPS_EMAIL
    sharedEntries = [{ email: legacyEmail, verified: true }]
  }

  function deriveLabel(email: string): string {
    const local = email.split('@')[0]
    return local.split(/[._-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const senders: Sender[] = sharedEntries
    .filter(e => typeof e.email === 'string' && e.email.includes('@'))
    .map(e => ({
      email:    e.email,
      label:    deriveLabel(e.email),
      type:     'shared' as const,
      verified: e.verified ?? false,
    }))

  const profile = Array.isArray(profiles) ? profiles[0] : null
  const sharedEmails = new Set(senders.map(s => s.email.toLowerCase()))

  if (profile?.gmail_email && !sharedEmails.has((profile.gmail_email as string).toLowerCase())) {
    const localPart = (profile.gmail_email as string).split('@')[0]
    const label = localPart.split(/[._-]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    senders.push({ email: profile.gmail_email as string, label, type: 'personal', verified: true })
  }

  return NextResponse.json(senders)
}
