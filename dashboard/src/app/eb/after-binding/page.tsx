import { redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadAfterBinding } from '@/lib/gb/after-binding-store'
import { AfterBinding } from '@/components/eb/AfterBinding'

export const dynamic = 'force-dynamic'

/** Employment Benefits › After binding: every EB policy's bill, movements and claims, read on the server. */
export default async function AfterBindingPage() {
  const user = await staffUser()
  if (!user?.email) redirect('/login?next=%2Feb%2Fafter-binding')
  return <AfterBinding rows={await loadAfterBinding()} />
}
