// The two emails the newsletter sends: the confirmation (double opt-in) and the weekly issue.
// Plain, Substack-like: one column, the site's name, articles as title + dek, then the three
// next steps. Pure functions so they can be previewed in the dashboard.

export type IssueArticle = { title: string; excerpt: string | null; url: string }
export type SiteBrand = { name: string; base_url: string; phone_wa: string | null }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const INK = '#1d1d1f', MUTED = '#6e6e73', ACCENT = '#44607d', RULE = '#e5e5ea'

function shell(site: SiteBrand, inner: string, footer: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT};color:${INK};">
<tr><td style="font-size:15px;font-weight:600;letter-spacing:-0.01em;padding-bottom:24px;">${esc(site.name)}</td></tr>
${inner}
<tr><td style="padding-top:32px;border-top:1px solid ${RULE};font-size:12.5px;line-height:1.6;color:${MUTED};">${footer}</td></tr>
</table></td></tr></table></body></html>`
}

export function confirmEmail(site: SiteBrand, confirmUrl: string): { subject: string; html: string; text: string } {
  const subject = `Confirm your subscription to ${site.name}`
  const inner = `<tr><td style="font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;padding-bottom:12px;">Confirm your subscription</td></tr>
<tr><td style="font-size:16px;line-height:1.6;padding-bottom:24px;">One email a week with the latest ${esc(site.name)} articles on business insurance. Confirm to start.</td></tr>
<tr><td style="padding-bottom:8px;"><a href="${esc(confirmUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Confirm subscription</a></td></tr>`
  const footer = `You receive this because this address was entered at ${esc(site.base_url.replace(/^https?:\/\//, ''))}. If that was not you, ignore this email and nothing more will be sent.`
  const text = `Confirm your subscription to ${site.name}\n\nOne email a week with the latest articles on business insurance.\n\nConfirm: ${confirmUrl}\n\nIf you did not ask for this, ignore this email.`
  return { subject, html: shell(site, inner, footer), text }
}

export function issueEmail(site: SiteBrand, issue: { subject: string; intro: string; dateLabel: string }, articles: IssueArticle[], links: { review: string; find: string; unsubscribe: string }): { subject: string; html: string; text: string } {
  const [lead, ...rest] = articles
  const para = (s: string) => s.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
  const art = (a: IssueArticle, big: boolean) => `<tr><td style="padding:${big ? '8px 0 24px' : '0 0 22px'};">
<a href="${esc(a.url)}" style="color:${INK};text-decoration:none;font-size:${big ? 24 : 18}px;font-weight:600;letter-spacing:-0.015em;line-height:1.3;">${esc(a.title)}</a>
${a.excerpt ? `<div style="font-size:15px;line-height:1.6;color:${MUTED};padding-top:6px;">${esc(a.excerpt)}</div>` : ''}
<div style="padding-top:8px;"><a href="${esc(a.url)}" style="color:${ACCENT};font-size:14.5px;font-weight:600;text-decoration:none;">Read the article</a></div></td></tr>`
  const step = (label: string, href: string) => `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid ${ACCENT};color:${ACCENT};text-decoration:none;font-weight:600;font-size:14px;padding:9px 16px;border-radius:10px;">${esc(label)}</a>`
  const inner = `<tr><td style="font-size:13px;color:${MUTED};padding-bottom:6px;">${esc(issue.dateLabel)}</td></tr>
${issue.intro.trim() ? `<tr><td style="font-size:16px;line-height:1.6;padding-bottom:12px;">${para(issue.intro)}</td></tr>` : ''}
${lead ? art(lead, true) : ''}
${rest.length ? `<tr><td style="font-size:13px;font-weight:600;color:${MUTED};padding:8px 0 14px;border-top:1px solid ${RULE};">Also this week</td></tr>${rest.map(a => art(a, false)).join('')}` : ''}
<tr><td style="padding:16px 0 4px;border-top:1px solid ${RULE};font-size:13px;font-weight:600;color:${MUTED};">Next steps</td></tr>
<tr><td style="padding:8px 0 0;">${step('Review my policy', links.review)}${step('Find my cover', links.find)}${site.phone_wa ? step('WhatsApp us', site.phone_wa) : ''}</td></tr>`
  const footer = `You receive this because you subscribed at ${esc(site.base_url.replace(/^https?:\/\//, ''))}. <a href="${esc(links.unsubscribe)}" style="color:${MUTED};">Unsubscribe</a>.`
  const text = [issue.dateLabel, '', issue.intro.trim(), '', ...articles.flatMap(a => [a.title, a.excerpt ?? '', a.url, '']),
    'Next steps', `Review my policy: ${links.review}`, `Find my cover: ${links.find}`, ...(site.phone_wa ? [`WhatsApp us: ${site.phone_wa}`] : []), '',
    `Unsubscribe: ${links.unsubscribe}`].join('\n')
  return { subject: issue.subject, html: shell(site, inner, footer), text }
}
