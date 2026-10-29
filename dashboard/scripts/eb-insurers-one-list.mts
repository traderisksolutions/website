/**
 * One insurer list (29–30 Oct 2026). Idempotent; safe to re-run.
 *   1. Insurers missing from Companies are added: HSBC Life, Etiqa, Prudential.
 *   2. Every employee-benefits insurer gets an active "Employee Benefits Insurance" product, so it
 *      appears in Tier C and on the Insurers page: the five rate-table schemes plus Great Eastern,
 *      Allianz, Chubb, Tokio Marine, HSBC Life, Etiqa, Prudential (Cigna, April, Liberty exist).
 *   3. Every person still on the old insurer_contacts list for employee benefits or group health is
 *      put on the matching product, so the old list can stop being read.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/eb-insurers-one-list.mts
 */
import { sb } from '../src/lib/crm/db'
import { createInsurer, createProduct, listProducts, addProductContact } from '../src/lib/insurer-products'
import { listInsurerCompanies } from '../src/lib/insurers'

const ACTOR = 'system:eb-one-list'
const NEW_INSURERS: [string, string][] = [['HSBC LIFE', 'hsbc.com.sg'], ['ETIQA', 'etiqa.com.sg'], ['PRUDENTIAL', 'prudential.com.sg']]
const EB_INSURERS = ['RAFFLES HEALTH INSURANCE', 'SINGAPORE LIFE LTD.', 'INCOME', 'AIA', 'QBE', 'GREAT EASTERN', 'ALLIANZ', 'CHUBB', 'TOKIO MARINE INSURANCE SINGAPORE LTD.', 'HSBC LIFE', 'ETIQA', 'PRUDENTIAL', 'CIGNA', 'APRIL', 'LIBERTY']
const PRODUCT = { employee_benefits: 'Employee Benefits Insurance', group_health: 'Group Health Insurance' } as const

for (const [name, domain] of NEW_INSURERS) console.log('insurer', (await createInsurer(name, domain)).name)

const companies = await listInsurerCompanies()
const byUpper = new Map(companies.map(c => [c.name.toUpperCase(), c]))
let products = await listProducts({ productLines: ['employee_benefits', 'group_health'] })
async function productFor(companyId: string, line: keyof typeof PRODUCT) {
  let p = products.find(x => x.insurer_company_id === companyId && x.product_line === line)
  if (!p) { p = await createProduct(companyId, { name: PRODUCT[line], product_line: line }, ACTOR); products.push(p); console.log('product', p.insurer_name, line) }
  return p
}
for (const n of EB_INSURERS) {
  const c = byUpper.get(n)
  if (!c) { console.log('MISSING company', n); continue }
  await productFor(c.id, 'employee_benefits')
}

type Old = { product_line: string; company_id: string | null; contacts: { email: string | null; first_name: string | null; last_name: string | null } | null }
const old = await sb<Old[]>('insurer_contacts?product_line=in.(employee_benefits,group_health)&select=product_line,company_id,contacts(email,first_name,last_name)')
let moved = 0
for (const o of old) {
  if (!o.company_id || !o.contacts?.email) continue
  const line = o.product_line as keyof typeof PRODUCT
  const p = await productFor(o.company_id, line)
  if (p.contacts.some(c => c.email === o.contacts!.email!.toLowerCase())) continue
  const name = [o.contacts.first_name, o.contacts.last_name].filter(Boolean).join(' ') || null
  const updated = await addProductContact(p.id, { email: o.contacts.email, name })
  products = products.map(x => (x.id === p.id ? updated : x))
  moved++
}
console.log('old contacts', old.length, 'moved', moved)
products = await listProducts({ productLines: ['employee_benefits', 'group_health'] })
console.log(products.map(p => `${p.insurer_name} · ${p.product_line} · ${p.contacts.length}`).join('\n'))
