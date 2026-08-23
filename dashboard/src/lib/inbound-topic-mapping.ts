// Maps the marketing site's fixed inbound-lead-capture topic chips (trade-risksol.com's
// contact/WhatsApp popover, see scripts/nav.js in the trs-website repo) onto the canonical
// product-line taxonomy in src/lib/product-lines.ts. Deterministic and free — a static lookup,
// not an AI classification — since the source set is a small fixed list, not free text.
//
// Note: trade credit insurance, TRS's core product, isn't one of the 5 chips the marketing
// site currently offers — flagged separately, not something this mapping can fix.
const TOPIC_TO_PRODUCT_LINE: Record<string, string> = {
  'Cyber Insurance':            'cyber',
  'Directors & Officers':       'do',
  'Commercial Property':        'iar_fire', // closest current-taxonomy equivalent; 'commercial_property' itself is a retired legacy slug
  'Employee Benefits':          'employee_benefits',
  'Work Injury (WICA)':         'wica',
}

export function mapInboundTopicToProductLine(topic: string | null | undefined): string | null {
  if (!topic) return null
  return TOPIC_TO_PRODUCT_LINE[topic.trim()] ?? null
}
