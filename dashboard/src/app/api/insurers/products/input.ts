/** The product fields from a request body, checked at the boundary. A string is the error to return. */
import { isValidProductLine } from '@/lib/product-lines'
import type { ProductInput } from '@/lib/insurer-products'

const strings = (v: unknown): string[] | null => Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : null
const num = (v: unknown): number | null | undefined => v === undefined ? undefined : v === null || v === '' ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN

export function productInputFrom(b: Record<string, unknown>): ProductInput | string {
  const out: ProductInput = {}
  if (b.name !== undefined) { if (typeof b.name !== 'string' || !b.name.trim()) return 'name cannot be blank'; out.name = b.name }
  if (b.product_line !== undefined) { if (typeof b.product_line !== 'string' || !isValidProductLine(b.product_line)) return 'Unknown product line'; out.product_line = b.product_line }
  for (const k of ['accepts', 'declines'] as const) {
    if (b[k] === undefined) continue
    const xs = strings(b[k]); if (!xs) return `${k} must be a list of text`; out[k] = xs
  }
  const minP = num(b.min_premium); if (Number.isNaN(minP)) return 'min_premium must be a number'; if (minP !== undefined) out.min_premium = minP
  const maxL = num(b.max_lives); if (Number.isNaN(maxL)) return 'max_lives must be a number'; if (maxL !== undefined) out.max_lives = maxL == null ? null : Math.round(maxL)
  if (b.notes !== undefined) { if (b.notes !== null && typeof b.notes !== 'string') return 'notes must be text'; out.notes = b.notes as string | null }
  if (b.status !== undefined) { if (b.status !== 'active' && b.status !== 'paused') return 'status must be active or paused'; out.status = b.status }
  return out
}
