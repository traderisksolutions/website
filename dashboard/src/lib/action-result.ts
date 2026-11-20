/**
 * What a server action returns (src/lib/auth/action.ts), safe to import in the browser. `unwrap`
 * turns a failed result back into a thrown Error for code written around try/catch.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error)
  return r.data
}
