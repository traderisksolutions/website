/**
 * POST   /api/insurers/products/[id]/contacts { email, name?, role_title?, is_default? } → { product }
 * PATCH  /api/insurers/products/[id]/contacts { contact_id } → { product }   (makes them the default)
 * DELETE /api/insurers/products/[id]/contacts { contact_id } → { product }   (takes them off this product)
 * The default person is who a request for this product is addressed to.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { addProductContact, removeProductContact, setDefaultContact } from '@/lib/insurer-products'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Ctx = { params: Promise<{ id: string }> }

async function prepare(req: NextRequest, ctx: Ctx) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return { error: unauthorized }
  const { id } = await ctx.params
  if (!isUuid(id)) return { error: fail('Product id is not valid') }
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return { error: fail('Body must be a JSON object') }
  return { id, b }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const p = await prepare(req, ctx)
  if ('error' in p) return p.error
  const { id, b } = p
  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) return fail('Email is not valid')
  try {
    return NextResponse.json({ product: await addProductContact(id, {
      email: b.email, name: typeof b.name === 'string' ? b.name : null, role_title: typeof b.role_title === 'string' ? b.role_title : null, is_default: b.is_default === true,
    }) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const p = await prepare(req, ctx)
  if ('error' in p) return p.error
  if (!isUuid(p.b.contact_id)) return fail('contact_id is required')
  try { return NextResponse.json({ product: await setDefaultContact(p.id, p.b.contact_id) }) }
  catch (e) { return errorResponse(e) }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const p = await prepare(req, ctx)
  if ('error' in p) return p.error
  if (!isUuid(p.b.contact_id)) return fail('contact_id is required')
  try { return NextResponse.json({ product: await removeProductContact(p.id, p.b.contact_id) }) }
  catch (e) { return errorResponse(e) }
}
