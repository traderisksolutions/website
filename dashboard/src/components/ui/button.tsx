import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The one button. Two heights only: 36 (default) and 30 (sm). Five levels:
 *   default      Primary — solid green, one per screen
 *   outline      Secondary — white, hairline border (`secondary` is the same look)
 *   ghost        Quiet — no border, muted text (`quiet` is the same look)
 *   destructive  Outlined red; the confirm step lives in the page, not in the colour
 *   link         Inline text action
 * Older size names (compact, xs, lg, icon-xs) map onto the two heights so callers keep working.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border text-[14px] font-medium transition-[background-color,border-color,color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trs-green focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "border-transparent bg-trs-green text-white hover:bg-trs-green-2",
        outline: "border-trs-line-2 bg-white text-trs-ink hover:border-trs-ink-2",
        secondary: "border-trs-line-2 bg-white text-trs-ink hover:border-trs-ink-2",
        ghost: "border-transparent bg-transparent text-trs-muted hover:bg-trs-canvas hover:text-trs-ink",
        quiet: "border-transparent bg-transparent text-trs-muted hover:bg-trs-canvas hover:text-trs-ink",
        destructive: "border-trs-line-2 bg-white text-trs-neg hover:border-trs-neg",
        link: "border-transparent text-trs-ink underline underline-offset-4 decoration-trs-subtle hover:decoration-trs-ink",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-[30px] px-2.5 text-[13px] rounded-[7px] [&_svg]:size-3.5",
        compact: "h-[30px] px-2.5 text-[13px] rounded-[7px] [&_svg]:size-3.5",
        xs: "h-[30px] px-2.5 text-[13px] rounded-[7px] [&_svg]:size-3.5",
        lg: "h-9 px-3.5",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-[30px] w-[30px] p-0 rounded-[7px] [&_svg]:size-3.5",
        "icon-xs": "h-[30px] w-[30px] p-0 rounded-[7px] [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
