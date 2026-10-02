/**
 * GET /api/group-benefits/coverage   → which insurer offers which cover and prints which benefit
 *                                      line, under its own wording, against the canon; and TRS's names.
 * PUT /api/group-benefits/coverage   { names: { [code]: name } } → saves TRS's names.
 *
 * Read from the current approved rate table per insurer — the same set a quote prices against.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { logActivity } from '@/lib/log-activity'
import { fetchAllRows } from '@/lib/postgrest-all'
import { PRODUCTS, BENEFITS } from '@/lib/gb/canon'
import { resolveProduct } from '@/lib/gb/resolve'
import { verificationOf } from '@/lib/gb/verification'
import { COVER_NAMES_KEY, cleanNames, type CoverNames } from '@/lib/gb/cover-names'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type Table = { id: string; insurer_id: string | null; insurer_name: string | null; plan_year: number | null; effective_date: string | null; rules: unknown }

async function names(): Promise<CoverNames> {
  const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${COVER_NAMES_KEY}&select=value&limit=1`, { headers: sbH(), cache: 'no-store' })
  const rows = res.ok ? await res.json() as { value: string | null }[] : []
  try { return JSON.parse(rows[0]?.value ?? '{}') as CoverNames } catch { return {} }
}

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try {
    if (req.nextUrl.searchParams.get('names') === '1') return NextResponse.json({ names: await names() })

    const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?status=eq.approved&select=id,insurer_id,insurer_name,plan_year,effective_date,rules`, { headers: sbH(), cache: 'no-store' })
    const all = tRes.ok ? await tRes.json() as Table[] : []
    const latest = new Map<string, Table>()
    for (const t of all) {
      const k = t.insurer_id ?? `name:${t.insurer_name ?? ''}`
      const cur = latest.get(k)
      if (!cur || (t.effective_date ?? '') > (cur.effective_date ?? '')) latest.set(k, t)
    }
    const tables = Array.from(latest.values()).sort((a, b) => (a.insurer_name ?? '').localeCompare(b.insurer_name ?? ''))
    if (!tables.length) return NextResponse.json({ insurers: [], products: [], benefits: [], names: await names() })
    const ids = tables.map(t => `"${t.id}"`).join(',')

    const [rates, bens, saved] = await Promise.all([
      fetchAllRows<{ rate_table_id: string; product_code: string; plan_code: string }>(
        `${SB_URL}/rest/v1/gb_rates?rate_table_id=in.(${ids})&select=rate_table_id,product_code,plan_code`, sbH()),
      fetchAllRows<{ rate_table_id: string; canon_benefit: string | null; benefit_name: string; plan_code: string | null }>(
        `${SB_URL}/rest/v1/gb_benefits?rate_table_id=in.(${ids})&canon_benefit=not.is.null&select=rate_table_id,canon_benefit,benefit_name,plan_code`, sbH()),
      names(),
    ])

    const products = PRODUCTS.map(p => ({
      code: p.code, canonName: p.name, abbrev: p.abbrev,
      cells: Object.fromEntries(tables.map(t => {
        const labels = Array.from(new Set(rates.filter(r => r.rate_table_id === t.id && resolveProduct(r.product_code).codes.includes(p.code)).map(r => r.product_code)))
        const plans = new Set(rates.filter(r => r.rate_table_id === t.id && labels.includes(r.product_code)).map(r => r.plan_code)).size
        return [t.id, labels.length ? { labels, plans } : null]
      })),
    }))

    const benefits = BENEFITS.slice().sort((a, b) =>
      PRODUCTS.findIndex(p => p.code === a.productCode) - PRODUCTS.findIndex(p => p.code === b.productCode) || a.sortOrder - b.sortOrder)
      .map(b => ({
        code: b.code, productCode: b.productCode, canonName: b.name, headline: !!b.headline,
        cells: Object.fromEntries(tables.map(t => {
          const rows = bens.filter(r => r.rate_table_id === t.id && r.canon_benefit === b.code)
          return [t.id, rows.length ? { printed: Array.from(new Set(rows.map(r => r.benefit_name.trim()))).slice(0, 4), plans: new Set(rows.map(r => r.plan_code ?? '*')).size } : null]
        })),
      }))

    return NextResponse.json({
      insurers: tables.map(t => ({ tableId: t.id, name: t.insurer_name, planYear: t.plan_year, verification: verificationOf(t.rules).status })),
      products, benefits, names: saved,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  try {
    const body = await req.json().catch(() => ({})) as { names?: unknown }
    const known = new Set([...PRODUCTS.map(p => p.code), ...BENEFITS.map(b => b.code)])
    const next = cleanNames(body.names, known)
    const before = await names()
    const res = await fetch(`${SB_URL}/rest/v1/app_settings?on_conflict=key`, {
      method: 'POST', headers: sbH('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify({ key: COVER_NAMES_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }),
    })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 500 })
    void logActivity({ action: 'gb.cover_names_updated', resource_type: 'app_settings', resource_id: COVER_NAMES_KEY,
                       old_value: before, new_value: next })
    return NextResponse.json({ names: next })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
