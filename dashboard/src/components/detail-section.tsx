import { cn } from '@/lib/utils'

interface DetailSectionProps {
  label?: string
  children: React.ReactNode
  className?: string
}

export function DetailSection({ label, children, className }: DetailSectionProps) {
  return (
    <div className={cn('px-4 pt-5 pb-3', className)}>
      {label && (
        <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/55 mb-2.5">
          {label}
        </p>
      )}
      {children}
    </div>
  )
}

interface DetailFieldProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function DetailField({ label, children, className }: DetailFieldProps) {
  return (
    <div className={cn('mb-3 last:mb-0', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60 mb-0.5">
        {label}
      </p>
      <div className="text-[12px] text-foreground/85 leading-[1.5]">
        {children}
      </div>
    </div>
  )
}
