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
        <p className="m-0 text-[12.5px] font-medium mb-2.5" style={{ color: '#5f6368' }}>
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
      <p className="m-0 text-[12px] mb-0.5" style={{ color: '#5f6368' }}>
        {label}
      </p>
      <div className="text-[14px] leading-[1.5]" style={{ color: '#202124' }}>
        {children}
      </div>
    </div>
  )
}
