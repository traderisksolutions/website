import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Who is signed in. The session cookie is httpOnly so the browser cannot read it directly;
 * this is the one endpoint the client-side auth shim calls.
 */
export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } })
}
