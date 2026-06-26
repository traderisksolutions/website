import type { Lead, RealMsg } from './types'
import { PERSONAL_DOMAINS } from './types'

export function fullName(l: Lead): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function domainOf(email: string | null | undefined): string {
  if (!email) return '__none__'
  return email.split('@')[1]?.toLowerCase() ?? '__none__'
}

export function companyLabel(domainKey: string): string {
  if (domainKey === '__personal__' || domainKey === '__none__') return 'Individual'
  const base = domainKey.split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function matchesSearch(lead: Lead, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return [lead.first_name, lead.last_name, lead.email, lead.company, lead.topic, lead.department, lead.details, lead.message, lead.subject]
    .some(v => v?.toLowerCase().includes(lower))
}

export function extractEmail(addr: string): string {
  if (!addr) return ''
  const match = addr.match(/<([^>]+)>/)
  return (match ? match[1] : addr).trim().toLowerCase()
}

export function stripQuotedContent(body: string): string {
  const lines = body.split('\n')
  const clean: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (/^-{3,}\s*(Forwarded message|Original Message)\s*-{3,}/i.test(t)) break
    if (/^On .{10,} wrote:\s*$/i.test(t)) break
    if (t.startsWith('>')) continue
    clean.push(line)
  }
  while (clean.length && !clean[clean.length - 1].trim()) clean.pop()
  return clean.some(l => l.trim()) ? clean.join('\n') : body
}

export function isPersonalDomain(email: string | null | undefined): boolean {
  const d = domainOf(email)
  return PERSONAL_DOMAINS.has(d) || d === '__none__'
}

export function needsReply(messages: RealMsg[]): boolean {
  return messages.at(-1)?.direction === 'inbound'
}

export function lastActivity(lead: Lead, messages: RealMsg[]): string {
  return messages.at(-1)?.sent_at ?? lead.created_at
}
