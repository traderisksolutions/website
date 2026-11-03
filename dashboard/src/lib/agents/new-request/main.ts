/**
 * The new-request main agent's review: every line the client asked for goes to its desk's
 * sub-agent; the results are merged into one set of client questions, broker notes and suggested
 * extra lines. Pure; the I/O is in src/lib/placement/auto.ts. See docs/agent-routing.md.
 *
 * Desks: eb, wica, liability (phase 2), car, financial, property, motor (phase 3). General lines
 * are reviewed by the line specs alone (src/lib/placement/lines.ts: required data, forms, panel).
 * One rule runs across every line: cover starting before today is backdated, and insurers ask a
 * signed nil-claims letter of undertaking for it (src/lib/letters/undertaking.ts).
 */
import { deskFor } from '../desks'
import { reviewEb } from './eb'
import { reviewLiability } from './liability'
import { reviewWica } from './wica'
import { reviewCar } from './car'
import { reviewFinancial } from './financial'
import { reviewProperty } from './property'
import { reviewMotor } from './motor'
import type { Companion, DeskReview, LineReviewer, RequestContext } from './types'

const REVIEWERS: Partial<Record<string, LineReviewer>> = { eb: reviewEb, wica: reviewWica, liability: reviewLiability, car: reviewCar, financial: reviewFinancial, property: reviewProperty, motor: reviewMotor }

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
  // A question several lines ask (PI and cyber both want revenue by country) is asked once, unlabelled.
  const shared = new Set(reviews.flatMap(r => r.asks).filter((a, _, all) => all.filter(b => b === a).length > 1))
  const many = ctx.lines.length > 1
  const asks = Array.from(new Set(reviews.flatMap((r, i) => r.asks.map(a => many && !shared.has(a) ? `${ctx.lines[i].label ?? ctx.lines[i].product_line}: ${a}` : a))))
  const requested = new Set(ctx.lines.map(l => l.product_line))
  const companions = reviews.flatMap(r => r.companions).filter((c, i, all) => !requested.has(c.product_line) && all.findIndex(o => o.product_line === c.product_line) === i)
  const backdated = !!ctx.today && ctx.lines.some(l => {
    const start = (l.spec.fields?.start_date ?? ctx.inception ?? '').slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(start) && start < ctx.today!
  })
  const common = backdated ? ['Cover is to start before today: please sign the nil-claims letter of undertaking we will send, confirming nothing has happened since that date'] : []
  return { reviews, asks: [...asks, ...common, ...companions.map(c => c.ask)], held: reviews.flatMap((r, i) => r.hold ? [i] : []), companions }
}
