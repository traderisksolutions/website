/**
 * The brochure and rate file behind each product of the house comparison, as Nathan's workbook
 * lists them (TRS EB Package Calculator, 15 Oct 2026). Pure; tested in src/__tests__/gb-brochures.test.ts.
 */
import type { SourceFile } from './drive'

export const HOUSE_PRODUCTS = ['RCC Enhanced III', 'Income FlexCare', 'Steadfast MCare+', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus'] as const
export type BrochureRow = { product: string; brochure: { name: string; url: string | null; year: string | null } | null; rates: { name: string; url: string | null } | null }

const matches = (folder: string, product: string) => folder.toLowerCase().replace(/^qbe\s+/, '').includes(product.toLowerCase())

/** One row per house product: its newest brochure and its rate file (calculator), or "Brochure rate table". */
export function brochureRows(files: SourceFile[]): BrochureRow[] {
  return HOUSE_PRODUCTS.map(product => {
    const mine = files.filter(f => matches(f.insurer, product)).sort((a, b) => (b.planYear ?? '').localeCompare(a.planYear ?? '') || (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''))
    const b = mine.find(f => f.kind === 'brochure')
    const c = mine.find(f => f.kind === 'calculator')
    return {
      product,
      brochure: b ? { name: b.filename, url: b.webViewLink, year: b.planYear } : null,
      rates: c ? { name: c.filename, url: c.webViewLink } : null,
    }
  })
}
