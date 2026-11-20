/**
 * The product library page's data, read on the server (docs/eb-v2.md P3): per house product what
 * the workbook holds, each rate table for the same insurer compared rate by rate (library.ts), and
 * the brochure folder's read queue (files not read, or changed since). No model; no writes.
 */
import { db, rows } from '@/lib/db/client'
import { loadWorkbook, PRODUCTS, type Workbook } from './workbook'
import { compareRates, productOfTable, type Comparison, type TableRate } from './library'
import { driveConfigured, listSourceFiles } from './drive'
import { matchSources, type RecordedSource, type SourceRow } from './sources'

export type LibraryTable = { id: string; insurer: string | null; planYear: number | null; effectiveDate: string | null; source: string | null; status: string | null; comparison: Comparison; differTotal: number }
export type LibraryProduct = { product: string; covers: { cover: string; plans: number; rates: number }[]; rates: number; benefits: number; tables: LibraryTable[] }
export type Library = {
  workbook: Workbook['file'] | null
  products: LibraryProduct[]
  /** Tables of insurers outside the five house products (Cigna): priced from the table alone. */
  others: { id: string; insurer: string | null; planYear: number | null; source: string | null }[]
  queue: { configured: boolean; notRead: SourceRow[]; changed: SourceRow[]; error: string | null }
}

const SHOWN = 60

async function tableRates(id: string): Promise<TableRate[]> {
  const out: TableRate[] = []
  for (let from = 0; ; from += 1000) {
    const page = await rows('Rate table rates', db().from('gb_rates')
      .select('rate_table_id,product_code,plan_code,age_min,age_max,member_type,premium,renewal_only,dimensions')
      .eq('rate_table_id', id).order('id').range(from, from + 999)) as TableRate[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}

async function readQueue(tables: { id: string; insurer_name: string | null; rules: unknown }[]): Promise<Library['queue']> {
  if (!driveConfigured()) return { configured: false, notRead: [], changed: [], error: null }
  try {
    const files = await listSourceFiles()
    const rowsOut = matchSources(files, tables.map(t => ({ rateTableId: t.id, insurerName: t.insurer_name, sources: ((t.rules as { sources?: RecordedSource[] } | null)?.sources ?? []) })))
    return { configured: true, notRead: rowsOut.filter(r => r.status === 'not_read'), changed: rowsOut.filter(r => r.status === 'changed'), error: null }
  } catch (e) {
    return { configured: true, notRead: [], changed: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function loadLibrary(): Promise<Library> {
  const [wb, tables] = await Promise.all([
    loadWorkbook(),
    rows('Rate tables', db().from('gb_rate_tables').select('id,insurer_name,plan_year,effective_date,source_pdf_name,status,rules').order('plan_year', { ascending: false })),
  ])
  const products: LibraryProduct[] = []
  for (const product of PRODUCTS) {
    const mine = wb?.rates.filter(r => r.insurer === product) ?? []
    const covers = [...new Set(mine.map(r => r.cover))].map(cover => ({
      cover, plans: wb?.lists[product]?.[cover]?.length ?? new Set(mine.filter(r => r.cover === cover).map(r => r.plan)).size, rates: mine.filter(r => r.cover === cover).length,
    }))
    const own = tables.filter(t => productOfTable(t.insurer_name) === product)
    const compared: LibraryTable[] = []
    for (const t of own) {
      const c = compareRates(product, wb?.rates ?? [], await tableRates(t.id))
      compared.push({ id: t.id, insurer: t.insurer_name, planYear: t.plan_year, effectiveDate: t.effective_date, source: t.source_pdf_name, status: t.status, comparison: { ...c, differ: c.differ.slice(0, SHOWN) }, differTotal: c.differ.length })
    }
    products.push({ product, covers, rates: mine.length, benefits: wb?.benefits.filter(b => b.insurer === product).length ?? 0, tables: compared })
  }
  const others = tables.filter(t => !productOfTable(t.insurer_name)).map(t => ({ id: t.id, insurer: t.insurer_name, planYear: t.plan_year, source: t.source_pdf_name }))
  return { workbook: wb?.file ?? null, products, others, queue: await readQueue(tables) }
}
