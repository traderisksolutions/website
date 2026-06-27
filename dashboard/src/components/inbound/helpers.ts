import type { Lead } from './types'
import { WA_SOURCES } from './constants'

export function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '—'
}

export function displayName(l: Lead) {
  const n = fullName(l)
  return n !== '—' ? n : l.email ?? l.phone ?? '—'
}

export function channelOf(l: Lead): 'whatsapp' | 'email' | 'manual' {
  if (WA_SOURCES.has(l.source)) return 'whatsapp'
  if (l.source === 'manual') return 'manual'
  return 'email'
}

export function messagePreview(l: Lead) {
  return l.details || l.message || ''
}

export function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
