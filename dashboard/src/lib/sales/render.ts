// Merge fields for campaign emails. Pure; tested.
//
//   {{first_name}} {{name}} {{company}} {{title}}   the contact
//   {{opening}}                                     one personal sentence, set per contact before approval
//   {{demo_link}} {{deck_link}} {{booking_link}}    the campaign's links
//
// An empty {{opening}} removes its line. An empty contact field falls back to a neutral word.
// A link that is not set is an error, never an empty string: an email promising a deck with no
// link is worse than no email.

export const MERGE_FIELDS = ['first_name', 'name', 'company', 'title', 'opening', 'demo_link', 'deck_link', 'booking_link'] as const
export type MergeField = (typeof MERGE_FIELDS)[number]

export type MergeValues = Partial<Record<MergeField, string | null>>

const FALLBACK: Partial<Record<MergeField, string>> = { first_name: 'there', name: 'there', company: 'your team', title: '', opening: '' }

/** Fields a template uses, including unknown ones (reported as errors). */
export function fieldsUsed(template: string): string[] {
  return Array.from(new Set(Array.from(template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)).map(m => m[1].toLowerCase())))
}

/** Problems that block activation: unknown fields, links not set. */
export function templateProblems(templates: string[], links: { demo_url: string | null; deck_url: string | null; booking_url?: string | null }): string[] {
  const used = new Set(templates.flatMap(fieldsUsed))
  const out: string[] = []
  for (const f of Array.from(used)) if (!(MERGE_FIELDS as readonly string[]).includes(f)) out.push(`Unknown field {{${f}}}`)
  if (used.has('demo_link') && !links.demo_url) out.push('Demo link not set')
  if (used.has('deck_link') && !links.deck_url) out.push('Deck link not set')
  if (used.has('booking_link') && !links.booking_url) out.push('Booking link not set')
  return out
}

export function applyMerge(template: string, v: MergeValues): string {
  // Remove the opening's own line only; a blank line it sat between is kept as one paragraph break.
  if (!(v.opening ?? '').trim()) template = template.replace(/^[ \t]*\{\{\s*opening\s*\}\}[ \t]*\r?\n/gim, '').replace(/\n{3,}/g, '\n\n')
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => {
    const k = key.toLowerCase() as MergeField
    if (!(MERGE_FIELDS as readonly string[]).includes(k)) return whole
    const value = (v[k] ?? '').toString().trim()
    if (value) return value
    if (k === 'demo_link' || k === 'deck_link' || k === 'booking_link') throw new Error(`${k} not set`)
    return FALLBACK[k] ?? ''
  })
}

/** "Re: " once, for follow-ups sent into the first email's thread. */
export function replySubject(first: string): string {
  return /^re:/i.test(first.trim()) ? first.trim() : `Re: ${first.trim()}`
}

// Common Chinese surnames in SG/HK romanisation. A name that starts with one is surname-first:
// "Lim Geok Khoon" is greeted "Geok Khoon", "Koh Dickson" "Dickson", and "Heng Yeow Teck
// Malcolm" by the English name at the end.
const SURNAME_FIRST = new Set(('tan lim lee ng ong wong goh chua chan koh teo ang yeo tay ho low toh sim chong chia leong foo seah lau tang wee yap loh poh kwek quek heng chew er choo lai lam cheung leung yip tsang kwok fung chow mak yu au siu kwan hui tse lo chu ma ko kong lui man pang tam tong wu yuen liu chen zhang huang zhou zhao li wang yang xu sun hu zhu guo he lin luo liang song zheng han feng deng cao peng zeng xiao tian dong pan yuan cai jiang ye du dai xia zhong lu').split(' '))

/** Ordinary first name from a full name, or null when it looks like a role account
 *  ("General Enquiries", "Sales Team"). */
export function firstNameOf(full: string | null | undefined): string | null {
  const s = (full ?? '').trim().replace(/^(mr|mrs|ms|mdm|dr|prof)\.?\s+/i, '').replace(/,/g, ' ')
  if (!s || /\b(enquir|inquir|team|desk|sales|info|admin|support|contact|office|general)/i.test(s)) return null
  const t = s.split(/\s+/)
  if (t.length >= 2 && SURNAME_FIRST.has(t[0].toLowerCase())) return t.length >= 4 ? t[t.length - 1] : t.slice(1, 3).join(' ')
  return t[0] ?? null
}

/** One personal sentence for Email 1 from a lead-tool draft: the first paragraph after the
 *  greeting, stopped before any pitch. Null when nothing usable. Always reviewed by a person. */
export function openingFromDraft(body: string | null | undefined): string | null {
  const paras = (body ?? '').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  for (const p of paras) {
    if (/^(hi|hello|dear|hey)\b/i.test(p)) continue
    if (/^hypothesis/i.test(p) || /\bTRS\b|Trade Risk Solutions|I'm |I am /i.test(p)) return null
    let s = p.replace(/^observation\s*:\s*/i, '').replace(/\s*[—–]\s*/g, ', ').trim()
    if (s.length > 280) {
      const cut = s.slice(0, 280)
      const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '))
      s = end > 60 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`
    }
    return s || null
  }
  return null
}
