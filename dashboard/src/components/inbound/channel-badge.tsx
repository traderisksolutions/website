import { MessageCircle, Mail, Globe, Pencil } from 'lucide-react'
import { WA_SOURCES } from './constants'

interface ChannelBadgeProps {
  source: string
}

export function ChannelBadge({ source }: ChannelBadgeProps) {
  if (WA_SOURCES.has(source)) {
    return (
      <span
        aria-label="WhatsApp lead"
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[5px] bg-emerald-500/10 text-emerald-700 whitespace-nowrap"
      >
        <MessageCircle size={10} />WhatsApp
      </span>
    )
  }
  if (source === 'website_form') {
    return (
      <span
        aria-label="Website form lead"
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[5px] bg-blue-500/10 text-blue-700 whitespace-nowrap"
      >
        <Globe size={10} />Website
      </span>
    )
  }
  if (source === 'manual') {
    return (
      <span
        aria-label="Manually added lead"
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[5px] bg-muted text-muted-foreground whitespace-nowrap"
      >
        <Pencil size={10} />Manual
      </span>
    )
  }
  return (
    <span
      aria-label="Email lead"
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[5px] bg-blue-500/10 text-blue-700 whitespace-nowrap"
    >
      <Mail size={10} />Email
    </span>
  )
}
