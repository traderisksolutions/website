import { createClient } from '@/lib/supabase/server'

/** The signed-in staff member's email, or null for cron / secret-authenticated calls. */
export async function currentUserEmail(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email?.toLowerCase() ?? null
  } catch { return null }
}
