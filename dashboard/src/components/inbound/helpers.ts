import type { Lead } from './types'
import { WA_SOURCES } from './constants'
export { timeAgo } from '@/lib/format'

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


export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
