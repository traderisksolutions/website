'use client'

import { Suspense } from 'react'
import { Board } from '@/components/home/Board'

/**
 * The board: the pinned companies in one column per stage of the work, each card showing its
 * threads, its policies and where every quote stands. Was the home page until 2 Nov 2026.
 */
export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  )
}
