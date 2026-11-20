'use client'

import { cn } from '@/lib/utils'

/**
 * One of a few cards, one chosen at a time (Apple-style: Jarod, 20 Nov 2026). The chosen card has
 * a 2px green edge; the rest a hairline. Children sit under the title and line (a detail list).
 */
export function ChoiceCard({ pressed, onClick, title, line, aside, children, className }: {
  pressed: boolean; onClick: () => void; title: string; line?: string; aside?: React.ReactNode; children?: React.ReactNode; className?: string
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={cn('flex w-full cursor-pointer flex-col gap-3 rounded bg-white px-5 py-4 text-left text-trs-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trs-green',
        pressed ? 'border-2 border-trs-green' : 'border-[1.5px] border-trs-line-2 hover:border-trs-subtle', className)}>
      <span className="flex w-full flex-col items-start justify-between gap-2 sm:flex-row sm:gap-3">
        <span className="min-w-0">
          <span className="block text-heading font-semibold leading-snug">{title}</span>
          {line && <span className="block text-body text-trs-ink-2">{line}</span>}
        </span>
        {aside && <span className="shrink-0 text-small leading-relaxed text-trs-ink-2 sm:text-right">{aside}</span>}
      </span>
      {children}
    </button>
  )
}
