'use client'

import { useEffect, useState } from 'react'

/**
 * Today's date as text, rendered only in the browser. Formatting the date during render gives the
 * server and the browser different text (Node and Chrome format dates differently, and midnight
 * can fall between the two), which React reports as a hydration error and re-renders the page.
 * Empty on the first render, then the formatted date.
 */
export function useToday(format: (d: Date) => string): string {
  const [text, setText] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setText(format(new Date())) }, [])
  return text
}
