import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] text-[14px] font-medium transition-[background-color,opacity,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4e3a] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[#132c1c] text-white hover:bg-[#1f4e3a]",
        destructive:
          "bg-white text-[#a1242f] border border-[#d5d9d4] hover:bg-[#faf9f6]",
        outline:
          "bg-white text-[#132c1c] shadow-[inset_0_0_0_1.5px_#132c1c] hover:bg-[#e0fcd8]",
        secondary:
          "bg-[#f1f2ee] text-[#0f1412] hover:bg-[#e6e8e4]",
        ghost: "text-[#4a5550] hover:bg-[#faf9f6] hover:text-[#0f1412]",
        link: "text-[#0f1412] underline underline-offset-4 decoration-[#8c958f] hover:decoration-[#0f1412]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-9 px-3.5 text-[13.5px]",
        compact: "h-8 px-3 text-[12.5px] rounded-[6px]",
        xs: "h-7 px-2.5 text-[12px] rounded-[6px]",
        lg: "h-11 px-5 text-[15px] rounded-[7px]",
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
