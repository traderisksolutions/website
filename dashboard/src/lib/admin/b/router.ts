/**
 * Recipient router: who a draft goes to. Pure; the loader in router-load.ts gathers the input.
 *
 * Order, first that gives an address wins:
 *   1. the last person on the case on the side being written to
 *   2. a contact who acts for the client with the matching scope (claims, accounts, a product line)
 *   3. the group's point of contact (parent company), same scope rules
 *   4. for the insurer side: the insurer desk on file, else the insurer's last handler on a
 *      similar thread
 *   5. nobody: a person decides, and the answer is saved as a fact for next time
 *
 * Every case reply copies operations@. Departed staff, automated senders and TRS's own staff
 * are never recipients on the To line.
 */
import { bareEmail, emailDomain, isAutomated, isInternal } from '@/lib/crm/db'

export const OPERATIONS = 'operations@trade-risksol.com'

export type Side = 'client' | 'insurer'
export type ScopedContact = { email: string; scope: string[]; status?: string | null; is_primary?: boolean | null }
export type CaseMail = { from: string; to: string[]; cc: string[]; sent_at: string | null; side: 'trs' | 'insurer' | 'client' }

export type RouteInput = {
  side: Side
  /** claims, accounts, or a product-line slug such as ghs, wica, motor. */
  scope: string
  messages: CaseMail[]
  clientContacts: ScopedContact[]
  groupContacts: ScopedContact[]
  /** Desk addresses from company_facts, e.g. key 'claims.desk' for the insurer. */
  insurerDesk: string[]
  /** The insurer handler on the latest similar thread (same insurer, same scope), if any. */
  insurerLastHandler: string | null
  insurerDomains: string[]
  departed: string[]
  /** The case owner, cc'd so replies reach them as well as operations@. */
  owner: string | null
}

export type Route =
  | { ok: true; to: string[]; cc: string[]; basis: string }
  | { ok: false; question: string }

const norm = (a: string) => bareEmail(a)

function usable(a: string, departed: Set<string>): boolean {
  return !!a && a.includes('@') && !isAutomated(a) && !departed.has(a) && !isInternal(a)
}

function scoped(list: ScopedContact[], scope: string, departed: Set<string>): string[] {
  const live = list.filter(c => (c.status ?? 'active') === 'active' && usable(norm(c.email), departed))
  const exact = live.filter(c => (c.scope ?? []).includes(scope))
  const all = live.filter(c => (c.scope ?? []).includes('all'))
  const pick = exact.length ? exact : all.length ? all : live.filter(c => c.is_primary)
  return Array.from(new Set(pick.map(c => norm(c.email))))
}

export function routeRecipients(i: RouteInput): Route {
  const departed = new Set(i.departed.map(norm))
  const insurer = new Set(i.insurerDomains.map(d => d.toLowerCase()))
  const onSide = (a: string) => i.side === 'insurer' ? insurer.has(emailDomain(a)) : !insurer.has(emailDomain(a)) && !isInternal(a)

  let to: string[] = [], cc: string[] = [], basis = ''

  // 1. the last person on the case on this side, and whoever they copied on their side
  const sorted = [...i.messages].sort((a, b) => String(b.sent_at ?? '').localeCompare(String(a.sent_at ?? '')))
  const last = sorted.find(m => m.side === i.side && usable(norm(m.from), departed))
  if (last) {
    to = [norm(last.from)]
    cc = [...last.to, ...last.cc].map(norm).filter(a => onSide(a) && usable(a, departed))
    basis = `last ${i.side} sender on the case`
  }
  if (!to.length && i.side === 'client') {
    const c = scoped(i.clientContacts, i.scope, departed)
    if (c.length) { to = c.slice(0, 1); cc = c.slice(1); basis = `client contact for ${i.scope}` }
    else {
      const g = scoped(i.groupContacts, i.scope, departed)
      if (g.length) { to = g.slice(0, 1); cc = g.slice(1); basis = `group contact for ${i.scope}` }
    }
  }
  if (!to.length && i.side === 'insurer') {
    const desk = i.insurerDesk.map(norm).filter(a => usable(a, departed))
    if (desk.length) { to = desk.slice(0, 1); cc = desk.slice(1); basis = 'insurer desk on file' }
    else if (i.insurerLastHandler && usable(norm(i.insurerLastHandler), departed)) { to = [norm(i.insurerLastHandler)]; basis = 'insurer handler on the latest similar thread' }
  }
  if (!to.length) return { ok: false, question: i.side === 'insurer' ? `Which insurer address handles ${i.scope} for this case?` : `Who at the client should receive this ${i.scope} email?` }

  const owner = i.owner ? norm(i.owner) : null
  const ccAll = [...cc, OPERATIONS, ...(owner && !departed.has(owner) ? [owner] : [])]
  return { ok: true, to, cc: Array.from(new Set(ccAll.filter(a => !to.includes(a)))), basis }
}
