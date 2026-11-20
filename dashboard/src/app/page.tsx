import { redirect } from 'next/navigation'

/** Jarod, 20 Nov 2026: Home retired; Today is the home page. */
export default function HomePage() {
  redirect('/today')
}
