/**
 * GET /api/debit-notes/preview-context?currency=SGD&companyId=<uuid>
 *
 * Feeds the live PDF preview on the review form with the things it needs but can't safely (bank
 * profile: service key) or can't at all (logo/QR presence: filesystem) resolve client-side:
 * - the bank/PayNow-or-wire profile (getBankProfileForCurrency needs the service key)
 * - the recipient company's name/address (same fields the real approve route resolves — see
 *   bundles/[id]/approve/route.ts)
 * - whether the real logo/PayNow-QR image assets exist in public/debit-note/ — the same
 *   existsSync() check debit-note-pdf-server.tsx uses for the real PDF, so the preview shows the
 *   same images instead of assuming (per a since-stale comment) that neither exists yet.
 * Read-only, never mutates anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getBankProfileForCurrency } from '@/lib/debit-note-bank-profile'
import { debitNoteAssetsPresent }    from '@/lib/debit-note-pdf-server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { searchParams } = req.nextUrl
    const currency  = searchParams.get('currency')
    const companyId = searchParams.get('companyId')

    const [bankProfile, company] = await Promise.all([
      getBankProfileForCurrency(currency),
      companyId
        ? fetch(`${SB_URL}/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}&select=name:company_name,address&limit=1`, { headers: sbH(), cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .then((rows: { name: string; address: string | null }[]) => (Array.isArray(rows) ? rows[0] ?? null : null))
        : Promise.resolve(null),
    ])
    const assets = debitNoteAssetsPresent()

    return NextResponse.json({ bankProfile, company, assets })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
