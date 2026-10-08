import { createClient } from '@/lib/supabase/server'

/** The signed-in staff email for audit fields, or 'cron' for headless calls. */
export async function actorEmail(): Promise<string> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    return user?.email ?? 'cron'
  } catch { return 'cron' }
}
