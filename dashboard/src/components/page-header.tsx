import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  /** One facts line under the title: counts, a period, a status. Never an explanation. */
  meta?: React.ReactNode
  /** Right side. The page's one primary goes last, so it sits top right. */
  actions?: React.ReactNode
  /** Under the title row: the page's Segmented filters or tabs. */
  children?: React.ReactNode
  className?: string
}

/** Every page opens with this: the title (EB Garamond, a noun), an optional facts line, the
 *  page's actions top right, then its filters. No grey description line, by standing rule. */
export function PageHeader({ title, meta, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 min-w-0', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em] leading-[1.15] text-trs-ink [text-wrap:balance]">{title}</h1>
          {meta && <div className="mt-1 text-[13.5px] tabular-nums text-trs-muted">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>}
    </header>
  )
}
