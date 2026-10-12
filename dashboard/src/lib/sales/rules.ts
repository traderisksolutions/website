// Pure rules for the sales workflow: no database, no clock unless passed. Tested.

export type DraftAction = 'approve' | 'reject' | 'reopen' | 'edit' | 'mark_replied'

/** Which statuses each action may start from. Anything else is refused, so two people
 *  clicking at once cannot, say, approve a draft already sent. */
export const ACTION_FROM: Record<DraftAction, string[]> = {
  approve: ['pending_approval'],
  reject: ['pending_approval', 'approved'],
  reopen: ['rejected', 'approved'],
  edit: ['pending_approval'],
  mark_replied: ['sent'],
}

export const ACTION_TO: Record<Exclude<DraftAction, 'edit'>, string> = {
  approve: 'approved', reject: 'rejected', reopen: 'pending_approval', mark_replied: 'replied',
}

/** Reasons a draft cannot be approved. Empty means it can. Only verified addresses are
 *  approvable: unverified ones bounce, and bounces damage the sending domain. */
export function approvalBlockers(d: {
  status: string; channel: string | null; email: string | null; contactEmailStatus: string | null; contactSuppressed: boolean
}): string[] {
  const out: string[] = []
  if (d.status !== 'pending_approval') out.push('Not pending approval')
  if (d.channel !== 'email') out.push('Not an email draft')
  if (!d.email) out.push('No recipient email')
  else if (d.contactEmailStatus !== 'verified') out.push('Recipient email not verified')
  if (d.contactSuppressed) out.push('Contact unsubscribed or suppressed')
  return out
}

/** Local office hours for a market: Mon to Fri, 09:00 to 17:00. */
const UTC_OFFSET: Record<string, number> = { SG: 8, HK: 8, MY: 8, ID: 7, TH: 7, VN: 7 }

export function withinSendWindow(location: string | null, now = new Date()): boolean {
  const offset = UTC_OFFSET[(location ?? 'SG').toUpperCase()] ?? 8
  const local = new Date(now.getTime() + offset * 3_600_000)
  const day = local.getUTCDay()
  const hour = local.getUTCHours()
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** [label](https://...) in a draft becomes a link on the label. Only http(s). */
export const TEXT_LINK = /\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]+)\)/g

/** Plain-text draft → minimal HTML: escaped, paragraphs kept, plus the sender identity and
 *  unsubscribe link every commercial email must carry (Spam Control Act). */
export function renderEmail(input: { body: string; businessName: string; businessDomain: string; unsubscribeUrl: string | null }): { html: string; text: string } {
  const linkify = (h: string) => h.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" style="color:#1a73e8">${u}</a>`)
  const inline = (p: string) => {
    let out = ''
    let last = 0
    for (const m of Array.from(p.matchAll(TEXT_LINK))) {
      out += linkify(esc(p.slice(last, m.index)))
      out += `<a href="${esc(m[2])}" style="color:#1a73e8">${esc(m[1])}</a>`
      last = (m.index ?? 0) + m[0].length
    }
    return out + linkify(esc(p.slice(last)))
  }
  const paras = input.body.trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${inline(p).replace(/\n/g, '<br/>')}</p>`)
  const footer =
    `<p style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#888">` +
    `${esc(input.businessName)} · ${esc(input.businessDomain)}` +
    (input.unsubscribeUrl ? `<br/>Not relevant? <a href="${esc(input.unsubscribeUrl)}" style="color:#888">Unsubscribe</a>` : '') + `</p>`
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124">${paras.join('')}${footer}</div>`
  const text = `${input.body.trim().replace(TEXT_LINK, '$1 ($2)')}\n\n--\n${input.businessName} · ${input.businessDomain}${input.unsubscribeUrl ? `\nUnsubscribe: ${input.unsubscribeUrl}` : ''}`
  return { html, text }
}
