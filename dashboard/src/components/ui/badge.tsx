import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "bg-[#f1f2ee] text-[#2a332f]",
        secondary:
          "bg-[#f1f2ee] text-[#2a332f]",
        destructive:
          "bg-[#f1f2ee] text-[#2a332f]",
        outline: "ring-1 ring-[#d5d9d4] text-[#2a332f] bg-white",
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
