/**
 * GET /api/placements/prefill?company_id=&product_line=
 *   → { existing, renewal_date, previous_premium, insurer } from the policy register, or { existing: null }
 * When the register holds the client's policy for that line, Add from emails fills Existing, the
 * renewal date and the previous premium from it; the person can change any of them.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sbTry, enc } from '@/lib/crm/db'
import { isValidProductLine } from '@/lib/product-lines'
import { fail, gate, isUuid } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const company = req.nextUrl.searchParams.get('company_id'), line = req.nextUrl.searchParams.get('product_line') ?? ''
  if (!isUuid(company)) return fail('company_id is required')
  if (!isValidProductLine(line)) return fail('Unknown product line')
  const rows = await sbTry<{ end_date: string | null; renewal_date: string | null; premium: number | null; bound_premium: number | null; insurer: string | null }[]>(
    `policies?company_id=eq.${company}&product_line=eq.${enc(line)}&lifecycle=in.(live,bound,renewal_due)&select=end_date,renewal_date,premium,bound_premium,insurer&order=end_date.desc.nullslast&limit=1`, [])
  const p = rows[0]
  if (!p) return NextResponse.json({ existing: null })
  return NextResponse.json({ existing: true, renewal_date: p.end_date ?? p.renewal_date ?? null, previous_premium: p.bound_premium ?? p.premium ?? null, insurer: p.insurer ?? null })
}
