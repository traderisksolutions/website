// Canonical product-line taxonomy for the RFQ engagement agent.
//
// This is the single source of truth shared by BOTH:
//   • the insurer directory (settings) — which line each insurer contact covers
//   • the RFQ detector (Phase B) — which line(s) an inbound request maps to
// The `slug` is the stable join key stored in the DB; `label` is for display.
// Edit this list to add/remove lines as the business grows.

export interface ProductLine {
  slug:  string
  label: string
}

export const PRODUCT_LINES: ProductLine[] = [
  { slug: 'cyber',                    label: 'Cyber Insurance' },
  { slug: 'do',                       label: 'Directors & Officers (D&O)' },
  { slug: 'commercial_property',      label: 'Commercial Property' },
  { slug: 'employee_benefits',        label: 'Employee Benefits' },
  { slug: 'wica',                     label: 'Work Injury (WICA)' },
  { slug: 'marine_cargo',             label: 'Marine / Cargo' },
  { slug: 'construction_car',         label: 'Construction / CAR' },
  { slug: 'motor_fleet',              label: 'Motor / Fleet' },
  { slug: 'professional_indemnity',   label: 'Professional Indemnity' },
  { slug: 'public_product_liability', label: 'Public / Product Liability' },
  { slug: 'business_interruption',    label: 'Business Interruption' },
  { slug: 'trade_credit',             label: 'Trade Credit' },
]

const LABEL_BY_SLUG: Record<string, string> =
  Object.fromEntries(PRODUCT_LINES.map(p => [p.slug, p.label]))

export function productLineLabel(slug: string): string {
  return LABEL_BY_SLUG[slug] ?? slug
}

export function isValidProductLine(slug: string): boolean {
  return slug in LABEL_BY_SLUG
}
