import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// PATCH /api/outbound/knowledge/[id]
// Body: any subset of { product_type, title, content, is_active, sort_order }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }   = await params
    const updates  = await req.json()

    const allowed = ['product_type', 'title', 'content', 'is_active', 'sort_order']
    const patch   = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    )
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const res = await fetch(`${SB_URL}/rest/v1/ob_knowledge_base?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify(patch),
    })

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    const [entry] = await res.json()
    return NextResponse.json({ entry })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/outbound/knowledge/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await fetch(`${SB_URL}/rest/v1/ob_knowledge_base?id=eq.${id}`, {
      method:  'DELETE',
      headers: sbHeaders(),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
