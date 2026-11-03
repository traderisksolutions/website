/** Shapes shared by the new-request main agent and its line sub-agents. Pure types. */
import type { Spec } from '@/lib/placement/types'
import type { Desk } from '../desks'

export type RequestLine = { product_line: string; label?: string | null; spec: Spec }

export type RequestContext = {
  /** Every line the client asked for, so a sub-agent knows what else is already being quoted. */
  lines: RequestLine[]
  /** The client's own words on the thread, newest last. */
  text: string
  inception: string | null
}

/** A line the client did not ask for but likely needs, put to the client as a question. */
export type Companion = { product_line: string; ask: string; why: string }

export type DeskReview = {
  desk: Desk
  product_line: string
  /** Questions for the client, in plain words. */
  asks: string[]
  /** The asks block approaching the market: the insurers cannot price without them. */
  hold: boolean
  /** For the broker, on the case log: what the sub-agent noticed and why it matters. */
  notes: string[]
  companions: Companion[]
}

export type LineReviewer = (line: RequestLine, ctx: RequestContext) => Omit<DeskReview, 'desk' | 'product_line'>
