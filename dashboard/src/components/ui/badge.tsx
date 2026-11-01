import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--trs-field)] text-[var(--trs-ink-2)]",
        secondary:
          "bg-[var(--trs-field)] text-[var(--trs-ink-2)]",
        destructive:
          "bg-[var(--trs-field)] text-[var(--trs-ink-2)]",
        outline: "ring-1 ring-[var(--trs-line-2)] text-[var(--trs-ink-2)] bg-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
