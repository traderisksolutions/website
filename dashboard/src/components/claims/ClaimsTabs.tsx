'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Segmented } from '@/components/crm/primitives'

type Tab = '/claims' | '/claims/second-opinion' | '/claims/documents'
const TABS: { value: Tab; label: string }[] = [
  { value: '/claims', label: 'Claims' },
  { value: '/claims/second-opinion', label: 'Second opinion' },
  { value: '/claims/documents', label: 'Documents' },
]

/** Claims is one place (Jarod, 20 Nov 2026): the register, second-opinion reports and the documents filed from mail. */
export function ClaimsTabs() {
  const path = usePathname()
  const router = useRouter()
  const value = (TABS.find(t => t.value !== '/claims' && path.startsWith(t.value))?.value ?? '/claims') as Tab
  return <Segmented<Tab> variant="tabs" label="Claims" value={value} onChange={v => router.push(v)} options={TABS} />
}
