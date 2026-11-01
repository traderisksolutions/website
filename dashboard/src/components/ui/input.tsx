import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[7px] border border-[var(--trs-line-2)] bg-white px-3.5 py-2 text-[14px] text-[var(--trs-ink)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--trs-subtle)] transition-colors focus-visible:outline-none focus-visible:border-[var(--trs-ink)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
