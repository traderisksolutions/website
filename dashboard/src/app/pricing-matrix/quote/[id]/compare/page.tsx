'use client'

/** Quotes › Employment Benefits › <company> · Compare cover. Back goes to the Employment Benefits list. */
import { useParams } from 'next/navigation'
import { CompareCover } from '@/components/group-benefits/CompareCover'

export default function ComparePage() {
  const { id } = useParams<{ id: string }>()
  return <CompareCover id={id} />
}
