/**
 * One person in To. Clients and insurers must not see who else was written to, so each company
 * gets its own email. Colleagues at the same company move to Cc; an address at another company
 * leaves the email and is reported. Pure and browser-safe. The send route is not changed: drafts,
 * edits and the composers hold this rule before a send is asked for.
 */
export const addressesIn = (v: string | string[] | null | undefined): string[] =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/)).map(a => a.trim().toLowerCase()).filter(a => a.includes('@'))

const domainOf = (a: string) => a.split('@')[1] ?? ''

export function oneRecipient(to: string | string[] | null | undefined, cc?: string | string[] | null): { to: string; cc: string[]; removed: string[] } {
  const all = Array.from(new Set(addressesIn(to)))
  const first = all[0] ?? ''
  const same = all.slice(1).filter(a => domainOf(a) === domainOf(first))
  const removed = all.slice(1).filter(a => domainOf(a) !== domainOf(first))
  return { to: first, cc: Array.from(new Set([...same, ...addressesIn(cc)])).filter(a => a !== first), removed }
}

/** What is wrong with a To field a person typed, or null. */
export function toProblem(to: string | null | undefined): string | null {
  return addressesIn(to).length > 1 ? 'To takes one address. Add colleagues in Cc. Other companies get their own email.' : null
}

/** TRS's own people, the only addresses a request to several insurers may copy. */
export const isTrsAddress = (a: string) => /@trade-risksol\.com$/i.test(a.trim())
