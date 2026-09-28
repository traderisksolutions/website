import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "bg-[#f1f3f4] text-[#3c4043]",
        secondary:
          "bg-[#f1f3f4] text-[#3c4043]",
        destructive:
          "bg-[#f1f3f4] text-[#3c4043]",
        outline: "ring-1 ring-[#dadce0] text-[#3c4043] bg-white",
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
