'use client'

/** <company> · Compare cover. Back goes where it was opened from: the Employment Benefits list, the company, the thread. With nothing on the trail, the list. */
import { useParams } from 'next/navigation'
import { CompareCover } from '@/components/group-benefits/CompareCover'

export default function ComparePage() {
  const { id } = useParams<{ id: string }>()
  return <CompareCover id={id} />
}
