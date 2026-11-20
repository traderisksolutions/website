/**
 * How Today's Read is worded (Jarod, 20 Nov 2026: "concise and clear: Send email to xxxx with
 * attachments; Request for quotation on xxxx project"). The model returns the parts of each step and
 * each point; code writes the sentences, so every step reads the same way and nothing is padded.
 *
 *   send      Send <who> <what>[ and ask for <ask>]
 *   quote     Request a quotation from <insurer> for <project>[ (<line>)]
 *   chase     Chase <who> for <what>
 *   ask       Ask <who> for <what>
 *   confirm   Confirm cover with <insurer> for <project>
 *   update    Update the draft to <who>: <what>
 *   discard   Discard the draft to <who>
 *   task      <What>
 *
 * Pure. Tested in src/__tests__/today-read-words.test.ts.
 */
export type StepParts = {
  verb?: string | null; who?: string | null; what?: string | null; ask?: string | null
  insurer?: string | null; project?: string | null; line?: string | null; title?: string | null
}
export type PointParts = { side?: string | null; who?: string | null; text?: string | null; date?: string | null }

/** Words that pad or sound like a form letter, and what to say instead. Whole words, any case. */
const PLAIN: [RegExp, string][] = [
  [/\bpending (email|draft)s?\b/gi, 'draft'],
  [/\bunsent (email|draft)s?\b/gi, 'draft'],
  [/\boutstanding\b/gi, 'still due'],
  [/\bensure\b/gi, 'make sure'],
  [/\bfacilitate\b/gi, 'help'],
  [/\bregarding\b/gi, 'about'],
  [/\bin order to\b/gi, 'to'],
  [/\bkindly\s+/gi, ''],
  [/\bplease be advised( that)?\s*/gi, ''],
  [/\bleverage\b/gi, 'use'],
  [/\butili[sz]e\b/gi, 'use'],
  [/\bthe said\b/gi, 'the'],
]

/** Plain words, one line, no trailing full stop. */
export function plain(text: string | null | undefined): string {
  let s = String(text ?? '').replace(/\s+/g, ' ').trim()
  for (const [re, to] of PLAIN) s = s.replace(re, to)
  return s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/[.;]+$/, '').trim()
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const low = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
/** A person's name, never an address: "sean.foo@ccccltd.sg" → "Sean Foo". */
export function personName(who: string | null | undefined): string {
  const w = String(who ?? '').trim()
  if (!w.includes('@')) return w
  return w.split('@')[0].split(/[._-]+/).filter(Boolean).map(cap).join(' ')
}

/** The step's sentence from its parts; the model's own title, made plain, when the parts are missing. */
export function stepTitle(p: StepParts): string {
  const who = personName(p.who), what = plain(p.what), ask = plain(p.ask), insurer = plain(p.insurer), project = plain(p.project), line = plain(p.line)
  const verb = String(p.verb ?? '').toLowerCase()
  let t = ''
  if (verb === 'send' && who && what) t = `Send ${who} ${low(what)}${ask ? ` and ask for ${low(ask)}` : ''}`
  else if (verb === 'quote' && insurer && project) t = `Request a quotation from ${insurer} for ${project}${line ? ` (${line})` : ''}`
  else if (verb === 'chase' && who && what) t = `Chase ${who} for ${low(what)}`
  else if (verb === 'ask' && who && what) t = `Ask ${who} for ${low(what)}`
  else if (verb === 'confirm' && insurer && project) t = `Confirm cover with ${insurer} for ${project}`
  else if (verb === 'update' && who) t = `Update the draft to ${who}${what ? `: ${low(what)}` : ''}`
  else if (verb === 'discard' && who) t = `Discard the draft to ${who}`
  else if (verb === 'task' && what) t = cap(what)
  return (t || cap(plain(p.title))).slice(0, 140)
}

/** One point: "Client · Sean Foo: accepted ECICS at S$1,868.75 before GST · 12 Nov". */
export function pointLine(p: PointParts): string {
  const side = p.side === 'insurer' ? 'Insurer' : p.side === 'client' ? 'Client' : ''
  const who = personName(p.who)
  const head = [side, who].filter(Boolean).join(' · ')
  const text = plain(p.text)
  if (!text) return ''
  const date = String(p.date ?? '').trim()
  return `${head ? `${head}: ` : ''}${low(text)}${date ? ` · ${date}` : ''}`.slice(0, 220)
}
