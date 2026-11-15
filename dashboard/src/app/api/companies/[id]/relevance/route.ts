/**
 * GET /api/companies/:id/relevance → the company's threads by relevance (active, back burner,
 * member movements), each with its label and case, and whether the company is in renewal season.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { companyRelevance } from '@/lib/cases/sources-store'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    return NextResponse.json(await companyRelevance(id, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}
