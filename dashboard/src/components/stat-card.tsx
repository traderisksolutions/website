import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'

type AccentColor = 'blue' | 'green' | 'amber' | 'red'

interface StatCardProps {
  label: string
  value: number | string
  sublabel?: string
  href?: string
  urgent?: boolean
  loading?: boolean
  accent?: AccentColor
  icon?: React.ElementType
  tooltip?: string
  className?: string
}

// State is not colour-coded: every accent resolves to the same grey field and ink number.
const ACCENT: Record<AccentColor, { bg: string; valueColor: string }> = {
  blue:  { bg: '#f1f3f4', valueColor: '#202124' },
  green: { bg: '#f1f3f4', valueColor: '#202124' },
  amber: { bg: '#f1f3f4', valueColor: '#202124' },
  red:   { bg: '#f1f3f4', valueColor: '#202124' },
}

export function StatCard({
  label, value, sublabel, href, urgent, loading, accent, icon: Icon, tooltip, className,
}: StatCardProps) {
  const ac = accent ? ACCENT[accent] : null
  const valueColor = '#202124'; void ac; void urgent

  const card = (
    <div
      className={cn(
        'relative rounded-[16px] px-5 py-4 transition-colors',
        href && 'hover:bg-[#e8eaed]',
        className,
      )}
      style={{ background: '#f1f3f4' }}
    >
      {/* Label + icon */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <p className="m-0 text-[12.5px]" style={{ color: '#5f6368' }}>
            {label}
          </p>
          {tooltip && <Tip text={tooltip} />}
        </div>
        {Icon && (
          <Icon
            className="h-4 w-4 flex-shrink-0" style={{ color: '#9aa0a6' }}
            strokeWidth={1.8}
          />
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div
          className="skeleton mb-1.5"
          style={{ width: 52, height: 28, borderRadius: 4 }}
        />
      ) : (
        <p
          className="m-0 text-[28px] font-medium tracking-[-0.02em] leading-none mb-1 tabular-nums"
          style={{ color: valueColor }}
        >
          {value}
        </p>
      )}

      {/* Sub-label */}
      {sublabel && (
        <p className="m-0 text-[12.5px] leading-tight" style={{ color: '#5f6368' }}>{sublabel}</p>
      )}
    </div>
  )

  return href ? (
    <Link href={href} className="block no-underline">
      {card}
    </Link>
  ) : (
    card
  )
}
