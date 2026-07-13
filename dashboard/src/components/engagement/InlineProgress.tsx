'use client'

// Thin indeterminate progress bar with an optional step label. Used under the
// AI-Analysis "Generate" and Reply "Generate reply" buttons (#3) so a multi-second
// AI call reads as active work rather than a frozen button.

export function InlineProgress({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-[10px] font-medium text-primary/80 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          {label}
        </span>
      )}
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-primary/10">
        <span className="absolute top-0 h-full rounded-full bg-primary/70 animate-trs-indeterminate" />
      </div>
    </div>
  )
}
