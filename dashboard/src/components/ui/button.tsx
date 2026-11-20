import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { btnClass, type BtnLevel } from "@/components/crm/primitives"
import { cn } from "@/lib/utils"

/**
 * The shadcn-style Button, drawn by the one button ladder in primitives (`btnClass`), so a
 * Button and a Btn look the same (step 1 of the platform clean-up, 20 Nov 2026). The variant and
 * size names stay so callers keep working:
 *   default → primary · outline, secondary → secondary · ghost, quiet → tertiary ·
 *   destructive → danger · link → inline text
 *   default, lg → 40px · sm, compact, xs → 32px · icon → 40px square · icon-sm, icon-xs → 32px square
 */
type Variant = "default" | "outline" | "secondary" | "ghost" | "quiet" | "destructive" | "link"
type Size = "default" | "sm" | "compact" | "xs" | "lg" | "icon" | "icon-sm" | "icon-xs"

const LEVEL: Record<Exclude<Variant, "link">, BtnLevel> = {
  default: "primary", outline: "secondary", secondary: "secondary", ghost: "tertiary", quiet: "tertiary", destructive: "danger",
}
const SMALL: Size[] = ["sm", "compact", "xs", "icon-sm", "icon-xs"]
const SVG = "[&_svg]:pointer-events-none [&_svg]:shrink-0"
const LINK = "inline-flex items-center gap-1.5 border-0 bg-transparent p-0 font-medium text-trs-ink underline underline-offset-4 decoration-trs-subtle hover:decoration-trs-ink cursor-pointer disabled:opacity-45"

function buttonVariants({ variant, size, className }: { variant?: Variant | null; size?: Size | null; className?: string } = {}): string {
  const v = variant ?? "default"
  const s = size ?? "default"
  const small = SMALL.includes(s)
  if (v === "link") return cn(LINK, small ? "text-[13px]" : "text-[14px]", SVG, className)
  const square = s.startsWith("icon") ? (small ? "w-8 px-0" : "w-10 px-0") : ""
  return cn(btnClass(LEVEL[v], small ? "xs" : "sm"), square, SVG, small ? "[&_svg]:size-3.5" : "[&_svg]:size-4", className)
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant | null
  size?: Size | null
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={buttonVariants({ variant, size, className })} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
