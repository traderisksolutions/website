// Canonical product-line taxonomy for the RFQ engagement agent.
//
// This is the single source of truth shared by BOTH:
//   • the insurer directory (settings) — which line each insurer contact covers
//   • the RFQ detector / wizard — which line(s) an inbound request maps to
//
// It mirrors the trade-risksol.com website navbar (Business → Assets /
// Liabilities, and Workforce). The `slug` is the stable join key stored in the
// DB; `label` is for display; `group` + `section` drive the grouped pickers.

export type ProductGroup = 'assets' | 'liabilities' | 'workforce'

export interface ProductLine {
  slug:    string
  label:   string
  group:   ProductGroup
  section: string
}

export const PRODUCT_GROUPS: { key: ProductGroup; label: string }[] = [
  { key: 'assets',      label: 'Business — Assets' },
  { key: 'liabilities', label: 'Business — Liabilities' },
  { key: 'workforce',   label: 'Workforce' },
]

export const PRODUCT_LINES: ProductLine[] = [
  // ── Business — Assets ──
  { slug: 'iar_fire',              label: 'Industrial All Risk (IAR) & Fire', group: 'assets', section: 'Property & Business' },
  { slug: 'business_interruption', label: 'Business Interruption (BI)',        group: 'assets', section: 'Property & Business' },
  { slug: 'construction_car',      label: "Contractors' All Risks (CAR)",      group: 'assets', section: 'Engineering & Construction' },
  { slug: 'machinery_breakdown',   label: 'Machinery Breakdown',               group: 'assets', section: 'Engineering & Construction' },
  { slug: 'electronic_equipment',  label: 'Electronic Equipment Insurance',    group: 'assets', section: 'Engineering & Construction' },
  { slug: 'commercial_vehicle',    label: 'Commercial Vehicle Insurance',      group: 'assets', section: 'Commercial Motor' },
  { slug: 'marine_cargo',          label: 'Marine Cargo',                      group: 'assets', section: 'Marine, Stock & Logistics' },
  { slug: 'stock_throughput',      label: 'Stock Throughput',                  group: 'assets', section: 'Marine, Stock & Logistics' },
  { slug: 'inland_transit',        label: 'Inland Transit',                    group: 'assets', section: 'Marine, Stock & Logistics' },
  { slug: 'trade_credit',          label: 'Trade Credit',                      group: 'assets', section: 'Trade Credit & Bonds' },
  { slug: 'surety_bonds',          label: 'Surety Bonds',                      group: 'assets', section: 'Trade Credit & Bonds' },

  // ── Business — Liabilities ──
  { slug: 'general_liability',       label: 'General Comprehensive Liability',        group: 'liabilities', section: 'General Liability' },
  { slug: 'professional_indemnity',  label: 'Professional Indemnity (PI)',            group: 'liabilities', section: 'Professional & Management' },
  { slug: 'do',                      label: 'Directors & Officers (D&O)',             group: 'liabilities', section: 'Professional & Management' },
  { slug: 'imi',                     label: 'Investment Management Insurance (IMI)',  group: 'liabilities', section: 'Professional & Management' },
  { slug: 'environmental_liability', label: 'Environmental Liability',                group: 'liabilities', section: 'Environmental Liability' },
  { slug: 'medical_malpractice',     label: 'Medical Malpractice Insurance',          group: 'liabilities', section: 'Medical' },
  { slug: 'cyber',                   label: 'Cyber Insurance',                        group: 'liabilities', section: 'Cyber' },

  // ── Workforce ──
  { slug: 'wica',                   label: 'Work Injury Compensation (WICA)',  group: 'workforce', section: 'Workers' },
  { slug: 'foreign_worker_medical', label: 'Foreign Worker Medical Insurance', group: 'workforce', section: 'Workers' },
  { slug: 'foreign_worker_bond',    label: 'Foreign Worker Bond Insurance',    group: 'workforce', section: 'Workers' },
  { slug: 'group_health',           label: 'Group Health Insurance',           group: 'workforce', section: 'Employees' },
  { slug: 'group_travel',           label: 'Group Business Travel',            group: 'workforce', section: 'Employees' },
  { slug: 'employee_benefits',      label: 'Employee Benefits Insurance',      group: 'workforce', section: 'Employees' },
  { slug: 'keyman',                 label: 'Keyman Insurance',                 group: 'workforce', section: 'Executive' },
]

// Friendly labels for retired slugs so any pre-existing directory / RFQ rows
// still read sensibly even though they're no longer offered in the pickers.
const LEGACY_LABELS: Record<string, string> = {
  commercial_property:      'Commercial Property (legacy)',
  motor_fleet:              'Motor / Fleet (legacy)',
  public_product_liability: 'Public / Product Liability (legacy)',
}

const LABEL_BY_SLUG: Record<string, string> =
  Object.fromEntries(PRODUCT_LINES.map(p => [p.slug, p.label]))

export function productLineLabel(slug: string): string {
  return LABEL_BY_SLUG[slug] ?? LEGACY_LABELS[slug] ?? slug
}

// Only current taxonomy slugs are valid for NEW writes.
export function isValidProductLine(slug: string): boolean {
  return slug in LABEL_BY_SLUG
}

// Grouped view for the pickers: [{ group, sections: [{ section, lines }] }]
export function groupedProductLines(): {
  key: ProductGroup; label: string; sections: { section: string; lines: ProductLine[] }[]
}[] {
  return PRODUCT_GROUPS.map(g => {
    const lines = PRODUCT_LINES.filter(l => l.group === g.key)
    const sections: { section: string; lines: ProductLine[] }[] = []
    for (const l of lines) {
      let s = sections.find(x => x.section === l.section)
      if (!s) { s = { section: l.section, lines: [] }; sections.push(s) }
      s.lines.push(l)
    }
    return { key: g.key, label: g.label, sections }
  })
}
