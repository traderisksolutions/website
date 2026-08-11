import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * House KPI-card pattern (per ~/dashboard-demo-template/DESIGN.md's "lead with the number"
 * grammar), built on this project's own existing .kpi-card/.kpi-grid CSS (globals.css) rather
 * than shadcn Card — keeps the visual language this app already has on other pages, instead of
 * introducing a second card system.
 */

export function MetricCard({ label, value, icon: Icon, sub, className }: {
  label: ReactNode
  value: ReactNode
  // size: string | number (not just number) to structurally match lucide-react's LucideProps —
  // lucide icon components carry a dev-mode `propTypes` field whose validator types only line up
  // when this prop's shape matches exactly, otherwise every lucide icon fails assignability here.
  icon?: ComponentType<{ className?: string; size?: number | string }>
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('kpi-card', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="kpi-label">{label}</p>
        {Icon && (
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon size={13} />
          </div>
        )}
      </div>
      <p className="kpi-value">{value}</p>
      {sub != null && <p className="kpi-sub">{sub}</p>}
    </div>
  )
}

export function MetricGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('kpi-grid grid-cols-2 md:grid-cols-4', className)}>
      {children}
    </div>
  )
}
