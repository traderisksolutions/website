import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[14px] font-medium transition-[background-color,opacity,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[#202124] text-white hover:opacity-90",
        destructive:
          "bg-white text-[#c5221f] border border-[#dadce0] hover:bg-[#f8f9fa]",
        outline:
          "border border-[#dadce0] bg-white text-[#202124] hover:bg-[#f8f9fa]",
        secondary:
          "bg-[#f1f3f4] text-[#202124] hover:bg-[#e8eaed]",
        ghost: "text-[#202124] hover:bg-[#f1f3f4]",
        link: "text-[#202124] underline underline-offset-4 decoration-[#9aa0a6] hover:decoration-[#202124]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3.5 text-[13.5px]",
        compact: "h-8 px-3 text-[12.5px] rounded-[8px]",
        xs: "h-7 px-2.5 text-[12px] rounded-[8px]",
        lg: "h-12 px-6 text-[15px] rounded-[12px]",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-xs": "h-6 w-6",
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
