/**
 * GET  /api/insurers/products → { insurers, products: (InsurerProduct & { stats })[] }
 *      Every insurer, every product with its people and its last twelve months of requests.
 * POST /api/insurers/products { insurer_company_id, product_line, name, accepts?, declines?, min_premium?, max_lives?, notes? } → { product }
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listInsurerCompanies } from '@/lib/insurers'
import { createProduct, listProducts, productStats } from '@/lib/insurer-products'
import { NO_STATS } from '@/lib/placement/rank'
import { errorResponse, fail, gate, isText, isUuid, readBody } from '@/lib/placement/api'
import { productInputFrom } from './input'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  try {
    const [insurers, products] = await Promise.all([listInsurerCompanies(), listProducts()])
    const stats = await productStats(products)
    return NextResponse.json({ insurers, products: products.map(p => ({ ...p, stats: stats.get(p.id) ?? NO_STATS })) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.insurer_company_id)) return fail('insurer_company_id is required')
  if (!isText(b.name)) return fail('name is required')
  const input = productInputFrom(b)
  if (typeof input === 'string') return fail(input)
  if (!input.product_line) return fail('product_line is required')
  try {
    const product = await createProduct(b.insurer_company_id, { ...input, name: b.name, product_line: input.product_line }, actor)
    return NextResponse.json({ product })
  } catch (e) {
    return errorResponse(e)
  }
}
