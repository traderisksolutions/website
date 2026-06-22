import Link from 'next/link'
import { cn } from '@/lib/utils'

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
  className?: string
}

const ACCENT: Record<AccentColor, { bg: string; valueColor: string }> = {
  blue:  { bg: 'rgba(15,61,145,0.05)',  valueColor: '#0F3D91' },
  green: { bg: 'rgba(15,138,95,0.06)',  valueColor: '#0F8A5F' },
  amber: { bg: 'rgba(194,122,7,0.06)',  valueColor: '#C27A07' },
  red:   { bg: 'rgba(194,65,77,0.06)', valueColor: '#C2414D' },
}

export function StatCard({
  label, value, sublabel, href, urgent, loading, accent, icon: Icon, className,
}: StatCardProps) {
  const ac = accent ? ACCENT[accent] : null
  const valueColor = ac ? ac.valueColor : (urgent ? '#0F3D91' : undefined)

  const card = (
    <div
      className={cn(
        'relative rounded-lg bg-card px-5 py-4 transition-shadow',
        href && 'hover:shadow-[0_2px_8px_rgba(16,24,40,0.12),0_4px_12px_rgba(16,24,40,0.06)]',
        className,
      )}
      style={{
        boxShadow: 'var(--card-shadow)',
        background: ac ? ac.bg : undefined,
      }}
    >
      {/* Label + icon */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <Icon
            className="h-4 w-4 text-muted-foreground/50 flex-shrink-0"
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
          className="text-2xl font-bold tracking-tight leading-none mb-1"
          style={{ color: valueColor }}
        >
          {value}
        </p>
      )}

      {/* Sub-label */}
      {sublabel && (
        <p className="text-[11px] text-muted-foreground leading-tight">{sublabel}</p>
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
