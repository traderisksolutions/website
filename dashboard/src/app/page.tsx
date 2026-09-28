'use client'

import { Suspense } from 'react'
import { Catalogue } from '@/components/home/Catalogue'

/**
 * Home is the client catalogue: an introduction, search, plain text views, one feature block,
 * and a calm grid of relationship cards that open the company detail in place.
 */
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Catalogue />
    </Suspense>
  )
}
