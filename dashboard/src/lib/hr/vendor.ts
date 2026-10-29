/**
 * Shared pieces for the HR Connect API connectors that read a whole employee list with one
 * credential HR pastes (HiBob, Deel, BambooHR). Pure apart from the injected fetch.
 */
import { HrConnectorError } from './connectors'

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
export type Rec = Record<string, unknown>
export const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
export const defaultFetch = fetch as unknown as FetchLike

/**
 * The first non-empty value under any of `names`, searched through nested objects, flat
 * "/root/firstName" or "root.firstName" keys alike. Case-insensitive; arrays are not entered.
 * Vendors move fields between categories (HiBob "personal" vs "about"), so the reader looks for
 * the field, not for one path.
 */
export function deepPick(rec: unknown, ...names: string[]): unknown {
  const want = new Set(names.map(n => n.toLowerCase()))
  const queue: unknown[] = [rec]
  while (queue.length) {
    const cur = queue.shift()
    if (!isRec(cur)) continue
    for (const [k, v] of Object.entries(cur)) {
      const leaf = k.split(/[./]/).filter(Boolean).pop()?.toLowerCase() ?? ''
      if ((want.has(k.toLowerCase()) || want.has(leaf)) && v != null && v !== '' && !isRec(v) && !Array.isArray(v)) return v
    }
    for (const v of Object.values(cur)) if (isRec(v)) queue.push(v)
  }
  return undefined
}

/** One request with the vendor's errors turned into messages HR can act on. */
export async function vendorJson(vendor: string, url: string, init: Parameters<FetchLike>[1], fetchImpl: FetchLike, hints: { unauthorized: string; forbidden?: string } ): Promise<unknown> {
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(url, init)
  } catch {
    throw new HrConnectorError(`${vendor} could not be reached. Try again in a minute.`)
  }
  if (res.status === 401) throw new HrConnectorError(hints.unauthorized, 401)
  if (res.status === 403) throw new HrConnectorError(hints.forbidden ?? hints.unauthorized, 401)
  if (res.status === 404) throw new HrConnectorError(`${vendor} did not recognise the account. Check the details and try again.`, 404)
  if (res.status === 429) throw new HrConnectorError(`${vendor} says too many requests were made. Try again in a few minutes.`, 429)
  if (!res.ok) throw new HrConnectorError(`${vendor} returned ${res.status}`, res.status)
  const text = await res.text()
  try { return JSON.parse(text) }
  catch { throw new HrConnectorError(`${vendor} returned a response that was not JSON.`, res.status) }
}

export const basicAuth = (user: string, pass: string): string => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

/** Spouse or child from a vendor's relationship label; anything else (parent, sibling, emergency contact) is not a dependant. */
export function dependantRelationship(raw: unknown): 'spouse' | 'child' | null {
  const s = String(raw ?? '').toLowerCase()
  if (/spouse|wife|husband|partner|married/.test(s)) return 'spouse'
  if (/child|son|daughter|stepchild|kid/.test(s)) return 'child'
  return null
}
