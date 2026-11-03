/**
 * GET /api/insurers/declines[?insurer_id=] → { declines } every insurer decline on file, newest
 * first: what was declined, why (the insurer's words), the client and the source thread.
 */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { sbTry, enc } from '@/lib/crm/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const id = req.nextUrl.searchParams.get('insurer_id')
  const declines = await sbTry(`insurer_declines?${id ? `insurer_company_id=eq.${enc(id)}&` : ''}select=id,insurer_company_id,insurer_name,kind,line,risk,reason,quote,client_name,client_company_id,declined_on,thread_id,source&order=declined_on.desc.nullslast&limit=2000`, [])
  return json({ declines })
}
