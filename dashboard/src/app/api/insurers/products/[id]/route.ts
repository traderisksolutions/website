/**
 * PATCH /api/insurers/products/[id] { name?, product_line?, accepts?, declines?, min_premium?, max_lives?, notes?, status? } → { product }
 * Pausing a product (status 'paused') takes it out of suggestions without losing its record.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateProduct } from '@/lib/insurer-products'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { productInputFrom } from '../input'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Product id is not valid')
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  const input = productInputFrom(b)
  if (typeof input === 'string') return fail(input)
  try {
    return NextResponse.json({ product: await updateProduct(id, input) })
  } catch (e) {
    return errorResponse(e)
  }
}
