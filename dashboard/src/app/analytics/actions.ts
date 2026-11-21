'use server'
/** The error log (21 Nov 2026): the latest errors, by source and age. Replaces /api/analytics/error-log. */
import { staffAction } from '@/lib/auth/action'
import { db, rows } from '@/lib/db/client'

export async function errorLog(opts: { limit?: number; source?: string | null; days?: number } = {}) {
  return staffAction('error log', async () => {
    const days = opts.days ?? 30
    let q = db().from('error_logs').select('id, created_at, source, feature, status_code, message, thread_id, resource_type, resource_id, metadata')
    if (opts.source) q = q.eq('source', opts.source)
    if (days > 0) q = q.gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString())
    return rows<Record<string, unknown>>('Error log', q.order('created_at', { ascending: false }).limit(Math.min(opts.limit ?? 500, 1000)))
  })
}
