import { WA_SOURCES } from './constants'

interface ChannelBadgeProps {
  source: string
}

// A category chip, not a state: one neutral fill, the channel name carries the meaning.
const CHIP = 'inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap'
const STYLE = { background: '#f1f3f4', color: '#3c4043' } as const

export function ChannelBadge({ source }: ChannelBadgeProps) {
  if (WA_SOURCES.has(source)) {
    return <span aria-label="WhatsApp lead" className={CHIP} style={STYLE}>WhatsApp</span>
  }
  if (source === 'website_form') {
    return <span aria-label="Website form lead" className={CHIP} style={STYLE}>Website</span>
  }
  if (source === 'manual') {
    return <span aria-label="Manually added lead" className={CHIP} style={STYLE}>Manual</span>
  }
  return <span aria-label="Email lead" className={CHIP} style={STYLE}>Email</span>
}
