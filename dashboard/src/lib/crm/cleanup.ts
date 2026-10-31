/**
 * The client-records cleanup plan: pure rules, no I/O, so the order and the retargeting can be
 * tested. scripts/client-cleanup.mts reads a plan file, applies these rules and writes.
 *
 * A plan is a list of actions read from the mailbox and the policy records, each with its
 * evidence and a tier: A (certain, evidence verbatim) runs on `apply A`; B waits for a person.
 */

export type CleanupAction = {
  action:
    | 'merge' | 'fix_email' | 'set_kind' | 'rename' | 'add_alias' | 'remove_alias' | 'add_domain' | 'remove_domain'
    | 'set_uen' | 'create_entity' | 'set_parent' | 'relink_thread' | 'relink_contact' | 'relink_policy'
    | 'relink_debit_note' | 'handles' | 'insures' | 'delete_record' | 'split_record' | 'set_contact'
  record_type: 'company' | 'contact' | 'thread' | 'policy' | 'debit_note'
  /** A record id, or `new:<legal name>` for an entity this plan creates. */
  id: string
  target_id?: string | null
  value?: string | null
  reason?: string
  tier: 'A' | 'B'
  domains?: string[]
}

/** Run order: identities first, then merges, then what hangs off the surviving records. */
const ORDER: Record<CleanupAction['action'], number> = {
  merge: 0, fix_email: 0, set_contact: 1, set_kind: 1, rename: 1, add_alias: 1, remove_alias: 1, add_domain: 1, remove_domain: 1, set_uen: 1,
  create_entity: 3, set_parent: 4, relink_thread: 5, relink_contact: 5, relink_policy: 5, relink_debit_note: 5,
  handles: 6, insures: 6, delete_record: 7, split_record: 9,
}

/** Actions a script may run unattended. Splitting a record needs a person to sort its threads. */
const RUNNABLE = new Set<CleanupAction['action']>(Object.keys(ORDER).filter(a => a !== 'split_record') as CleanupAction['action'][])

export function stepOf(a: CleanupAction): number {
  // Contact merges and email fixes go before company merges, so a merged contact moves once.
  if (a.action === 'merge') return a.record_type === 'contact' ? 0 : 2
  return ORDER[a.action]
}

/**
 * The actions to run for a tier, in order, with every reference to a company that merges away
 * pointed at its survivor. An identity edit on a record that disappears is dropped, except an
 * alias, which moves to the survivor so the old spelling still files mail.
 */
export function orderPlan(plan: CleanupAction[], tier: 'A' | 'B'): CleanupAction[] {
  const picked = plan.filter(a => a.tier === tier && RUNNABLE.has(a.action))
  const into = new Map<string, string>()
  for (const a of picked) if (a.action === 'merge' && a.record_type === 'company' && a.target_id) into.set(a.id, a.target_id)
  const survivor = (id: string | null | undefined) => {
    let cur = id ?? null
    for (let i = 0; cur && into.has(cur) && i < 10; i++) cur = into.get(cur)!
    return cur
  }
  const out: CleanupAction[] = []
  for (const a of picked) {
    const b = { ...a }
    if (b.action === 'merge' && b.record_type === 'company') { b.target_id = survivor(b.target_id); if (b.target_id === b.id) continue; out.push(b); continue }
    if (b.record_type === 'company' && into.has(b.id)) {
      if (b.action !== 'add_alias' && b.action !== 'add_domain') continue
      b.id = survivor(b.id)!
    }
    if (b.target_id && !b.target_id.startsWith('new:') && (b.action === 'set_parent' || b.action === 'create_entity' || b.action.startsWith('relink_') || b.action === 'handles' || b.action === 'insures')) {
      b.target_id = survivor(b.target_id)
    }
    if (b.action === 'set_parent' && b.target_id === b.id) continue
    out.push(b)
  }
  return out.sort((x, y) => stepOf(x) - stepOf(y))
}

/** What a contact handles, as product-line slugs, read from a short description. */
export function scopeOf(text: string | null | undefined): string[] {
  const t = ` ${(text ?? '').toLowerCase()} `
  const out = new Set<string>()
  const add = (slug: string, re: RegExp) => { if (re.test(t)) out.add(slug) }
  add('employee_benefits', /\b(eb|ghs|gtl|gpa|gmm|gp|outpatient|employee benefit|group (health|hospital|term|medical)|medical card|census|employee list)\b/)
  add('claims', /\bclaims?\b/)
  add('accounts', /\b(accounts?|payment|invoice|billing|debit note|finance|premium payment)\b/)
  add('motor', /\b(motor|fleet|vehicle|van|lorry|car insurance)\b/)
  add('car', /\b(car|ear|contractors?'? all risks?|erection all risks?)\b/)
  add('wica', /\b(wic|wica|work injury|foreign worker|fwmi|fwbond|pel)\b/)
  add('property', /\b(iar|fire|property|industrial all risks?|business interruption)\b/)
  add('liability', /\b(cgl|public liability|pl|products liability)\b/)
  add('pi', /\b(pi|professional indemnity|d&o|directors)\b/)
  add('cyber', /\bcyber\b/)
  add('marine', /\b(marine|cargo|hull|p&i)\b/)
  add('credit', /\b(trade credit|credit insurance)\b/)
  return Array.from(out).sort()
}

const KINDS = new Set(['client', 'insurer', 'partner', 'other'])
/** companies.kind allows four values; the plan's finer words fold into them. */
export function kindOf(value: string | null | undefined): 'client' | 'insurer' | 'partner' | 'other' {
  const v = (value ?? '').toLowerCase().trim()
  if (KINDS.has(v)) return v as 'client' | 'insurer' | 'partner' | 'other'
  if (/^(re)?insurer/.test(v)) return 'insurer'
  if (/^(broker|tpa|partner|co-?broker|introducer)/.test(v)) return 'partner'
  if (/^individual/.test(v)) return 'client'
  return 'other'
}

/**
 * Name and title read from a signature, as "name: Joe Kam Chee Yong; title: Director". The name
 * splits at its first space only so the two fields read back as written.
 */
export function contactFields(value: string | null | undefined): { first_name?: string; last_name?: string; title?: string } {
  const out: { first_name?: string; last_name?: string; title?: string } = {}
  for (const part of (value ?? '').split(/;\s*(?=(?:name|title):)/i)) {
    const m = part.match(/^\s*(name|title):\s*(.+?)\s*$/i)
    if (!m) continue
    if (m[1].toLowerCase() === 'title') { out.title = m[2]; continue }
    const [first, ...rest] = m[2].split(/\s+/)
    out.first_name = first
    if (rest.length) out.last_name = rest.join(' ')
  }
  return out
}

/** A stable key per action, so a re-run skips what already succeeded. */
export function actionKey(a: CleanupAction): string {
  return [a.action, a.record_type, a.id, a.target_id ?? '', a.value ?? ''].join('|')
}
