import { WA_SOURCES } from './constants'

interface ChannelBadgeProps {
  source: string
}

// A category chip, not a state: one neutral fill, the channel name carries the meaning.
const CHIP = 'inline-flex items-center rounded px-2 py-0.5 text-small leading-4 whitespace-nowrap bg-trs-field text-trs-muted'

export function ChannelBadge({ source }: ChannelBadgeProps) {
  if (WA_SOURCES.has(source)) {
    return <span aria-label="WhatsApp lead" className={CHIP}>WhatsApp</span>
  }
  if (source === 'website_form') {
    return <span aria-label="Website form lead" className={CHIP}>Website</span>
  }
  if (source === 'manual') {
    return <span aria-label="Manually added lead" className={CHIP}>Manual</span>
  }
  return <span aria-label="Email lead" className={CHIP}>Email</span>
}
