import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SB_URL            = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const DEFAULT_OPS_EMAIL = 'operations@trade-risksol.com'

export type Sender = {
  email:   string
  label:   string
  type:    'shared' | 'personal'
}

// GET /api/email/available-senders
// Returns the list of From addresses the current employee can send from:
// - Shared ops@ address (always present, from app_settings)
// - Their own @trade-risksol.com address (only if they've connected their Gmail in Settings)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const k = process.env.SUPABASE_SERVICE_KEY!
  const h = { apikey: k, Authorization: `Bearer ${k}` }

  const [settingsRes, profileRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/app_settings?key=eq.reply_from_email&select=value&limit=1`, { headers: h, cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=gmail_email&limit=1`,  { headers: h, cache: 'no-store' }),
  ])

  const settings = settingsRes.ok ? await settingsRes.json() : []
  const profiles = profileRes.ok  ? await profileRes.json()  : []

  const opsEmail = (Array.isArray(settings) && settings[0]?.value) ? String(settings[0].value) : DEFAULT_OPS_EMAIL
  const profile  = Array.isArray(profiles) ? profiles[0] : null

  const senders: Sender[] = [
    { email: opsEmail, label: 'Operations (shared)', type: 'shared' },
  ]

  if (profile?.gmail_email && profile.gmail_email !== opsEmail) {
    // Derive a friendly label from the email local-part (e.g. jarod.hong → Jarod Hong)
    const localPart = (profile.gmail_email as string).split('@')[0]
    const label = localPart
      .split(/[._-]/)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    senders.push({ email: profile.gmail_email as string, label, type: 'personal' })
  }

  return NextResponse.json(senders)
}
