import { redirect } from 'next/navigation'
import { CompaniesBoard } from '@/components/companies/CompaniesBoard'
import { staffUser } from '@/lib/auth/guard'
import { listBoard, type BoardPayload } from '@/lib/crm/board'

export const dynamic = 'force-dynamic'

/** Companies: the board is read here, on the server, and handed to the register with the signed-in person. */
export default async function CompaniesPage() {
  const user = await staffUser()
  if (!user?.email) redirect('/login?next=%2Fcompanies')
  let initial: BoardPayload | null = null
  try {
    initial = { ...await listBoard(), me: user.email.toLowerCase() }
  } catch (e) {
    // The register reads the board itself and shows the error with Retry.
    console.error('[companies] board read failed', e)
  }
  return <CompaniesBoard initial={initial} />
}
