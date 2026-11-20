import { redirect } from 'next/navigation'
import { staffUser } from '@/lib/auth/guard'
import { loadLibrary, type Library } from '@/lib/gb/library-server'
import { ProductLibrary } from '@/components/eb/ProductLibrary'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Employment Benefits › Products: the house workbook beside the rate tables, read on the server. */
export default async function ProductsPage() {
  const user = await staffUser()
  if (!user?.email) redirect('/login?next=%2Feb%2Fproducts')
  let data: Library | null = null, error: string | null = null
  try { data = await loadLibrary() } catch (e) { error = e instanceof Error ? e.message : String(e) }
  return <ProductLibrary data={data} error={error} />
}
