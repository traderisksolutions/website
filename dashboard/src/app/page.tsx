'use client'

import { Suspense } from 'react'
import { Board } from '@/components/home/Board'

/**
 * Home is the board: the pinned companies in one column per stage of the work, each card
 * showing its threads, its policies and where every quote stands.
 */
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  )
}
