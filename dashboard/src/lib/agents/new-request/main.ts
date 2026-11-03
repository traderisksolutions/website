/**
 * The new-request main agent's review: every line the client asked for goes to its desk's
 * sub-agent; the results are merged into one set of client questions, broker notes and suggested
 * extra lines. Pure; the I/O is in src/lib/placement/auto.ts. See docs/agent-routing.md.
 *
 * Phase 2 desks: eb, wica, liability. Every other line is reviewed by the line specs alone
 * (src/lib/placement/lines.ts: required data, forms, panel), as before.
 */
import { deskFor } from '../desks'
import { reviewEb } from './eb'
import { reviewLiability } from './liability'
import { reviewWica } from './wica'
import type { Companion, DeskReview, LineReviewer, RequestContext } from './types'

const REVIEWERS: Partial<Record<string, LineReviewer>> = { eb: reviewEb, wica: reviewWica, liability: reviewLiability }

export type RequestReview = {
  reviews: DeskReview[]
  /** Client questions across the lines, labelled by line when there are several, once each. */
  asks: string[]
  /** Lines (by index in ctx.lines) whose asks block approaching the market. */
  held: number[]
  companions: Companion[]
}

export function reviewRequest(ctx: RequestContext): RequestReview {
  const reviews: DeskReview[] = ctx.lines.map(l => {
    const desk = deskFor(l.product_line)
    const r = REVIEWERS[desk]?.(l, ctx) ?? { asks: [], hold: false, notes: [], companions: [] }
    return { desk, product_line: l.product_line, ...r }
  })
  const many = ctx.lines.length > 1
  const asks = Array.from(new Set(reviews.flatMap((r, i) => r.asks.map(a => many ? `${ctx.lines[i].label ?? ctx.lines[i].product_line}: ${a}` : a))))
  const requested = new Set(ctx.lines.map(l => l.product_line))
  const companions = reviews.flatMap(r => r.companions).filter((c, i, all) => !requested.has(c.product_line) && all.findIndex(o => o.product_line === c.product_line) === i)
  return { reviews, asks: [...asks, ...companions.map(c => c.ask)], held: reviews.flatMap((r, i) => r.hold ? [i] : []), companions }
}
