/**
 * Server-side activity logger for API routes.
 * Reads the authenticated user from the Supabase session — never trust caller-supplied identity.
 * Fire-and-forget: never throws, never blocks the calling route.
 */

import { createClient } from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

export type ActivityPayload = {
  action:         string
  resource_type?: string
  resource_id?:   string
  lead_email?:    string
  old_value?:     Record<string, unknown>
  new_value?:     Record<string, unknown>
  metadata?:      Record<string, unknown>
}

export async function logActivity(payload: ActivityPayload): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return

    const userName: string | null =
      (user.user_metadata?.['full_name'] as string | undefined) ??
      (user.user_metadata?.['name'] as string | undefined) ??
      user.email.split('@')[0]

    await fetch(`${SB_URL}/rest/v1/audit_logs`, {
      method:  'POST',
      headers: {
        apikey:         k,
        Authorization:  `Bearer ${k}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({
        user_id:       user.id,
        user_email:    user.email,
        user_name:     userName,
        action:        payload.action,
        resource_type: payload.resource_type ?? null,
        resource_id:   payload.resource_id   ?? null,
        lead_email:    payload.lead_email     ?? null,
        old_value:     payload.old_value      ?? null,
        new_value:     payload.new_value      ?? null,
        metadata:      payload.metadata       ?? null,
      }),
    })
  } catch {
    // Logging must never disrupt the calling route
  }
}
