'use server'
/**
 * Insurers (21 Nov 2026): the directory, adding an insurer, its products and their contacts,
 * the threads filed under an insurer and which policy each is about, and declines. They replace
 * /api/insurers, /api/insurers/products[/id][/contacts], /api/insurers/[id]/threads,
 * /api/insurers/declines and /api/thread-insurers/[id].
 *
 * Mail visibility: an insurer's thread list is cut to the threads the signed-in person may see;
 * the route listed every one (a colleague's private thread by subject).
 */
import { staffAction } from '@/lib/auth/action'
import { db, rows, one } from '@/lib/db/client'
import { isText, isUuid } from '@/lib/placement/api'
import { listInsurerCompanies } from '@/lib/insurers'
import { addProductContact, createInsurer, createProduct, listProducts, productStats, removeProductContact, setDefaultContact, updateProduct } from '@/lib/insurer-products'
import { productInputFrom } from '@/lib/insurer-product-input'
import { NO_STATS } from '@/lib/placement/rank'
import { sameInsurer } from '@/lib/insurers/threads'
import { visibleThreadIds } from '@/lib/mail/visibility-server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function uuid(v: unknown, what: string): string {
  if (!isUuid(v)) throw new Error(`${what} is not valid`)
  return v
}

export async function insurers() {
  return staffAction('insurers', async () => listInsurerCompanies())
}

export async function addInsurer(name: string, domain?: string | null) {
  return staffAction('add insurer', async () => {
    if (!isText(name)) throw new Error('name is required')
    return createInsurer(name, domain ?? null)
  })
}

/** Every insurer and its products, each with how it has done on past requests. */
export async function products() {
  return staffAction('products', async () => {
    const [ins, list] = await Promise.all([listInsurerCompanies(), listProducts()])
    const stats = await productStats(list)
    return { insurers: ins, products: list.map(p => ({ ...p, stats: stats.get(p.id) ?? NO_STATS })) }
  })
}

export async function addProduct(b: Record<string, unknown>) {
  return staffAction('add product', async user => {
    const insurerId = uuid(b.insurer_company_id, 'insurer_company_id')
    if (!isText(b.name)) throw new Error('name is required')
    const input = productInputFrom(b)
    if (typeof input === 'string') throw new Error(input)
    if (!input.product_line) throw new Error('product_line is required')
    return { product: await createProduct(insurerId, { ...input, name: b.name, product_line: input.product_line }, user.email) }
  })
}

export async function editProduct(id: string, b: Record<string, unknown>) {
  return staffAction('edit product', async () => {
    const input = productInputFrom(b)
    if (typeof input === 'string') throw new Error(input)
    return { product: await updateProduct(uuid(id, 'Product id'), input) }
  })
}

export async function addContact(productId: string, b: { email?: string; name?: string | null; role_title?: string | null; is_default?: boolean }) {
  return staffAction('add product contact', async () => {
    if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) throw new Error('Email is not valid')
    return { product: await addProductContact(uuid(productId, 'Product id'), { email: b.email, name: b.name ?? null, role_title: b.role_title ?? null, is_default: b.is_default === true }) }
  })
}

export async function makeDefaultContact(productId: string, contactId: string) {
  return staffAction('default contact', async () => ({ product: await setDefaultContact(uuid(productId, 'Product id'), uuid(contactId, 'contact_id')) }))
}

export async function removeContact(productId: string, contactId: string) {
  return staffAction('remove product contact', async () => ({ product: await removeProductContact(uuid(productId, 'Product id'), uuid(contactId, 'contact_id')) }))
}

export async function declines(insurerId?: string | null) {
  return staffAction('declines', async () => {
    let q = db().from('insurer_declines').select('id, insurer_company_id, insurer_name, kind, line, risk, reason, quote, client_name, client_company_id, declined_on, thread_id, source')
    if (insurerId) q = q.eq('insurer_company_id', insurerId)
    return { declines: await rows('Declines', q.order('declined_on', { ascending: false, nullsFirst: false }).limit(2000)) }
  })
}

type ThreadRow = { id: string; thread_id: string; client_company_id: string | null; policy_id: string | null; via: string; policy_status: string; policy_how: string | null; confidence: number | null; reason: string | null; last_message_at: string | null }
type Pol = { id: string; company_id: string; label: string | null; class_of_insurance: string | null; policy_number: string | null; insurer: string | null; start_date: string | null }

/** The threads filed under the insurer, each with its client and the client's policies to pick from. */
export async function insurerThreads(id: string) {
  return staffAction('insurer threads', async user => {
    const insurer = await one<{ id: string; company_name: string; domain: string | null }>('Insurer', db().from('companies').select('id, company_name, domain').eq('id', uuid(id, 'Insurer id')).maybeSingle())
    if (!insurer) throw new Error('Insurer not found')
    const all = (await rows('Insurer threads', db().from('thread_insurers')
      .select('id, thread_id, client_company_id, policy_id, via, policy_status, policy_how, confidence, reason, last_message_at')
      .eq('insurer_company_id', id).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1000))) as unknown as ThreadRow[]
    const seen = await visibleThreadIds([...new Set(all.map(r => r.thread_id))], user.email)
    const list = all.filter(r => seen.has(r.thread_id))
    const tIds = [...new Set(list.map(r => r.thread_id))], cIds = [...new Set(list.map(r => r.client_company_id).filter(Boolean) as string[])]
    const [threads, clients, pols] = await Promise.all([
      tIds.length ? rows<{ id: string; subject: string | null; display_subject: string | null }>('Threads', db().from('email_threads').select('id, subject, display_subject').in('id', tIds)) : [],
      cIds.length ? rows<{ id: string; company_name: string }>('Clients', db().from('companies').select('id, company_name').in('id', cIds)) : [],
      cIds.length ? (rows('Policies', db().from('policies').select('id, company_id, label, class_of_insurance, policy_number, insurer, start_date').in('company_id', cIds).order('start_date', { ascending: false, nullsFirst: false })) as unknown as Promise<Pol[]>) : [],
    ])
    const tm = new Map(threads.map(t => [t.id, t.display_subject || t.subject])), cm = new Map(clients.map(c => [c.id, c.company_name]))
    const label = (p: Pol) => [p.label ?? p.class_of_insurance ?? 'Policy', p.policy_number, p.insurer].filter(Boolean).join(' · ')
    return {
      insurer,
      hidden: all.length - list.length,
      rows: list.map(r => {
        const options = pols.filter(p => p.company_id === r.client_company_id)
          .sort((a, b) => Number(sameInsurer(b.insurer, insurer.company_name)) - Number(sameInsurer(a.insurer, insurer.company_name)))
          .map(p => ({ id: p.id, label: label(p), same_insurer: sameInsurer(p.insurer, insurer.company_name) }))
        return { ...r, subject: tm.get(r.thread_id) ?? '(no subject)', client: r.client_company_id ? { id: r.client_company_id, name: cm.get(r.client_company_id) ?? 'Company' } : null, options }
      }),
    }
  })
}

/** Confirms which policy an insurer thread is about, or marks it as not about a policy. */
export async function setThreadPolicy(id: string, b: { policy_id?: string | null; not_a_policy?: boolean }) {
  return staffAction('thread policy', async user => {
    const row = await one<{ id: string; client_company_id: string | null }>('Thread insurer', db().from('thread_insurers').select('id, client_company_id').eq('id', uuid(id, 'Row id')).maybeSingle())
    if (!row) throw new Error('Row not found')
    let patch: Record<string, unknown>
    if (b.not_a_policy === true) patch = { policy_id: null, policy_status: 'not_a_policy', policy_how: 'broker', reason: `Marked by ${user.email}` }
    else {
      const policyId = uuid(b.policy_id, 'Policy id')
      const p = await one<{ company_id: string | null }>('Policy', db().from('policies').select('company_id').eq('id', policyId).maybeSingle())
      if (!p) throw new Error('Policy not found')
      if (row.client_company_id && p.company_id !== row.client_company_id) throw new Error('That policy belongs to another company')
      patch = { policy_id: policyId, policy_status: 'confirmed', policy_how: 'broker', reason: `Confirmed by ${user.email}` }
    }
    const out = await one('Save thread policy', db().from('thread_insurers').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id).select('*').maybeSingle())
    return { row: out }
  })
}
