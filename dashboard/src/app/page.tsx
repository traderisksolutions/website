'use client'

import { HomeMap } from '@/components/home/HomeMap'

/**
 * Home is the map of the work: client, TRS and insurer joined by three bridges (quotes and
 * renewals, claims, endorsements and members), each with what is open and who it waits on.
 * The pinned-company board moved to /board.
 */
export default function HomePage() {
  return <HomeMap />
}
