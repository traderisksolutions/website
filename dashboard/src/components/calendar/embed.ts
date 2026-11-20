/**
 * Calendar as a view on Today (20 Nov 2026). /calendar keeps its page; Today renders the same page
 * inside this context, and the calendar then draws no page title of its own and leaves the
 * address bar alone (Today owns it).
 */
import { createContext, useContext } from 'react'

export const CalendarEmbedded = createContext(false)
export const useCalendarEmbedded = () => useContext(CalendarEmbedded)
