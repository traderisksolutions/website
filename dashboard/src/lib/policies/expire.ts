/**
 * A live policy past its end date is no longer in force. The status never rolled by itself:
 * 149 policies ending between Sep 2024 and Nov 2026 were still "active" on 11 Nov 2026, and
 * showed as in force on company pages and in renewal counts. Idempotent; run hourly by the
 * admin sweep. A renewal is its own row, so expiring the old one hides nothing.
 */
import { sb, sbTry } from '@/lib/crm/db'

export async function expirePolicies(today = new Date().toISOString().slice(0, 10)): Promise<{ expired: number }> {
  const rows = await sbTry<{ id: string }[]>(`policies?status=eq.active&lifecycle=eq.live&end_date=lt.${today}&select=id&limit=1000`, [])
  for (const r of rows) await sb(`policies?id=eq.${r.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'expired' }) })
  return { expired: rows.length }
}
