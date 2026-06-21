import { cn } from '@/lib/utils'

type CalloutVariant = 'info' | 'warning' | 'success' | 'error' | 'note'

interface InfoCalloutProps {
  variant?: CalloutVariant
  title?: string
  children: React.ReactNode
  className?: string
}

const STYLES: Record<CalloutVariant, {
  bg: string; border: string; borderLeft: string; titleColor: string; bodyColor: string
}> = {
  info: {
    bg:          'rgba(15,61,145,0.05)',
    border:      'rgba(15,61,145,0.15)',
    borderLeft:  'rgba(15,61,145,0.35)',
    titleColor:  '#0F3D91',
    bodyColor:   'rgba(16,24,40,0.75)',
  },
  warning: {
    bg:          'rgba(194,122,7,0.05)',
    border:      'rgba(194,122,7,0.22)',
    borderLeft:  'rgba(194,122,7,0.40)',
    titleColor:  '#C27A07',
    bodyColor:   '#92400e',
  },
  success: {
    bg:          'rgba(15,138,95,0.05)',
    border:      'rgba(15,138,95,0.18)',
    borderLeft:  'rgba(15,138,95,0.40)',
    titleColor:  '#0F8A5F',
    bodyColor:   'rgba(16,24,40,0.75)',
  },
  error: {
    bg:          'rgba(194,65,77,0.06)',
    border:      'rgba(194,65,77,0.20)',
    borderLeft:  'rgba(194,65,77,0.40)',
    titleColor:  '#C2414D',
    bodyColor:   'rgba(16,24,40,0.75)',
  },
  note: {
    bg:          'rgba(20,30,50,0.04)',
    border:      'rgba(20,30,50,0.10)',
    borderLeft:  'rgba(20,30,50,0.20)',
    titleColor:  '#475467',
    bodyColor:   'rgba(16,24,40,0.70)',
  },
}

export function InfoCallout({ variant = 'info', title, children, className }: InfoCalloutProps) {
  const s = STYLES[variant]

  return (
    <div
      className={cn('rounded-lg px-4 py-3.5', className)}
      style={{
        background:  s.bg,
        border:      `1px solid ${s.border}`,
        borderLeft:  `4px solid ${s.borderLeft}`,
      }}
    >
      {title && (
        <p
          className="text-[11px] font-bold uppercase tracking-[0.07em] mb-1.5"
          style={{ color: s.titleColor }}
        >
          {title}
        </p>
      )}
      <div className="text-[13px] leading-relaxed" style={{ color: s.bodyColor }}>
        {children}
      </div>
    </div>
  )
}
