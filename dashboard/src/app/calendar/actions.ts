'use server'
/** The calendar's events between two dates (21 Nov 2026). Replaces /api/calendar/events. */
import { staffAction } from '@/lib/auth/action'
import { calendarEvents } from '@/lib/calendar/events-server'

export async function events(from: string, to: string, companyId?: string | null) {
  return staffAction('calendar', async () => calendarEvents({ from, to, companyId }))
}
